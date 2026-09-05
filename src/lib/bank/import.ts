import type { Sql } from "postgres";
import type { ParsedBankFile, BankCsvRow } from "./csv";
import { autoExclusionReason } from "./rules";
import { parsePayerDetails } from "./payerParse";
import { writeAudit } from "@/lib/audit";
import { getCutoffDate } from "@/lib/settings";

export const CUTOFF_IGNORE_REASON = "לפני תאריך החתך — כבר גולם ביתרת הפתיחה";

// קליטת דף חשבון — כלל ברזל 4: המערכת לא סומכת על הבנק, היא סומכת
// על עצמה. לפני כל כתיבה מוצג מסך ביניים; הכתיבה רק לאחר אישור.

export interface BankPreviewRow {
  rowNumber: number;
  txnDate: string;
  description: string | null;
  details: string | null;
  credit: string;
  disposition: "new" | "duplicate" | "ignored";
  ignoredReason: string | null;
  payerName: string | null; // חולץ משדה "פרטים"; null = לתור הידני
  bankKey: string | null;
  payerAccount: string | null; // מספר חשבון המשלם ("מח-ן") — מפתח למידה יציב
  purpose: string | null;
}

export interface BankPreview {
  fileName: string;
  encoding: string;
  rangeFrom: string | null;
  rangeTo: string | null;
  rowsTotal: number; // תנועות זכות בקובץ
  rowsNew: number;
  rowsDuplicate: number; // כבר טופלו בקליטות קודמות (או כפולות בקובץ)
  rowsIgnored: number; // הוחרגו אוטומטית
  debitRowsFiltered: number;
  skippedRows: { rowNumber: number; reason: string }[];
  rows: BankPreviewRow[];
}

export interface BankImportReport {
  batchId: string;
  rowsTotal: number;
  rowsNew: number;
  rowsDuplicate: number;
  rowsIgnored: number;
}

/** מסווג כל שורה: חדשה / כפולה (hash קיים ב-DB) / מוחרגת אוטומטית. */
export async function previewBankFile(
  sql: Sql,
  parsed: ParsedBankFile,
  fileName: string
): Promise<BankPreview> {
  const hashes = parsed.rows.map((r) => r.rowHash);
  const existing =
    hashes.length > 0
      ? await sql`
          select row_hash from bank_transactions
          where row_hash in ${sql(hashes)}
        `
      : [];
  const existingSet = new Set(existing.map((r) => r.rowHash as string));
  const cutoff = await getCutoffDate(sql);

  const rows: BankPreviewRow[] = parsed.rows.map((r) => {
    let disposition: BankPreviewRow["disposition"] = "new";
    let ignoredReason: string | null = null;
    if (existingSet.has(r.rowHash)) {
      disposition = "duplicate";
    } else if (cutoff && r.txnDate <= cutoff) {
      // שורה עד תאריך החתך (כולל) — כבר גולמה ביתרת הפתיחה הידנית
      disposition = "ignored";
      ignoredReason = CUTOFF_IGNORE_REASON;
    } else {
      ignoredReason = autoExclusionReason(r);
      if (ignoredReason) disposition = "ignored";
    }
    const payer = parsePayerDetails(r.details);
    return {
      rowNumber: r.rowNumber,
      txnDate: r.txnDate,
      description: r.description,
      details: r.details,
      credit: r.credit,
      disposition,
      ignoredReason,
      payerName: payer?.payerName ?? null,
      bankKey: payer?.bankKey ?? null,
      payerAccount: payer?.payerAccount ?? null,
      purpose: payer?.purpose ?? null,
    };
  });

  const dates = parsed.rows.map((r) => r.txnDate).sort();
  return {
    fileName,
    encoding: parsed.encoding,
    rangeFrom: dates[0] ?? null,
    rangeTo: dates[dates.length - 1] ?? null,
    rowsTotal: parsed.rows.length + parsed.duplicatesInFile,
    rowsNew: rows.filter((r) => r.disposition === "new").length,
    rowsDuplicate:
      rows.filter((r) => r.disposition === "duplicate").length +
      parsed.duplicatesInFile,
    rowsIgnored: rows.filter((r) => r.disposition === "ignored").length,
    debitRowsFiltered: parsed.debitRowsFiltered,
    skippedRows: parsed.skippedRows,
    rows,
  };
}

/**
 * קליטה בפועל, לאחר אישור המשתמש במסך הביניים.
 * שורות כפולות אינן נטענות מחדש; מוחרגות נשמרות בסטטוס ignored.
 * הכנסה בסדר כרונולוגי עולה, הכול בטרנזקציה אחת.
 */
export async function commitBankFile(
  sql: Sql,
  parsed: ParsedBankFile,
  opts: { actor: string; fileName: string }
): Promise<BankImportReport> {
  const preview = await previewBankFile(sql, parsed, opts.fileName);
  const byRowNumber = new Map(preview.rows.map((r) => [r.rowNumber, r]));

  return sql.begin(async (tx) => {
    const [batch] = await tx`
      insert into import_batches
        (file_name, range_from, range_to, rows_total, rows_new,
         rows_duplicate, rows_ignored)
      values
        (${opts.fileName}, ${preview.rangeFrom}, ${preview.rangeTo},
         ${preview.rowsTotal}, ${preview.rowsNew}, ${preview.rowsDuplicate},
         ${preview.rowsIgnored})
      returning id
    `;

    // parsed.rows כבר ממוין כרונולוגית עולה
    const toInsert: BankCsvRow[] = parsed.rows.filter(
      (r) => byRowNumber.get(r.rowNumber)?.disposition !== "duplicate"
    );

    for (const r of toInsert) {
      const p = byRowNumber.get(r.rowNumber)!;
      await tx`
        insert into bank_transactions
          (row_hash, batch_id, txn_date, value_date, description, details,
           account, reference, credit, balance_after,
           parsed_payer_name, parsed_bank_key, parsed_payer_account, parsed_purpose,
           status, ignored_reason)
        values
          (${r.rowHash}, ${batch.id as string}, ${r.txnDate}, ${r.valueDate},
           ${r.description}, ${r.details}, ${r.account}, ${r.reference},
           ${r.credit}, ${r.balanceAfter},
           ${p.payerName}, ${p.bankKey}, ${p.payerAccount}, ${p.purpose},
           ${p.disposition === "ignored" ? "ignored" : "new"},
           ${p.ignoredReason})
        on conflict (row_hash) do nothing
      `;
    }

    await writeAudit(tx, {
      actor: opts.actor,
      action: "bank_import",
      entity: "import_batches",
      entityId: batch.id as string,
      after: {
        file_name: opts.fileName,
        rows_total: preview.rowsTotal,
        rows_new: preview.rowsNew,
        rows_duplicate: preview.rowsDuplicate,
        rows_ignored: preview.rowsIgnored,
      },
    });

    return {
      batchId: batch.id as string,
      rowsTotal: preview.rowsTotal,
      rowsNew: preview.rowsNew,
      rowsDuplicate: preview.rowsDuplicate,
      rowsIgnored: preview.rowsIgnored,
    };
  });
}

/** סימון ידני "לא תשלום לקוח" / ביטול הסימון (כלל עיבוד 5). */
export async function setTransactionIgnored(
  sql: Sql,
  id: string,
  ignored: boolean,
  actor: string,
  reason?: string
) {
  return sql.begin(async (tx) => {
    const [before] = await tx`
      select * from bank_transactions where id = ${id}
    `;
    if (!before) throw new Error("תנועה לא נמצאה");
    const allowed = ["new", "ignored", "needs_review"];
    if (!allowed.includes(before.status as string)) {
      throw new Error(
        `אי אפשר לשנות סימון לתנועה בסטטוס "${before.status}"`
      );
    }
    const [after] = await tx`
      update bank_transactions
      set status = ${ignored ? "ignored" : "new"},
          ignored_reason = ${ignored ? (reason ?? "סומן ידנית — לא תשלום לקוח") : null}
      where id = ${id}
      returning *
    `;
    await writeAudit(tx, {
      actor,
      action: ignored ? "bank_txn_ignore" : "bank_txn_unignore",
      entity: "bank_transactions",
      entityId: id,
      before: { status: before.status, ignored_reason: before.ignoredReason },
      after: { status: after.status, ignored_reason: after.ignoredReason },
    });
    return after;
  });
}
