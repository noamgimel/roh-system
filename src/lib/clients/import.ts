import type { Sql } from "postgres";
import type { ParsedWorkbook, ExcelClientField } from "./excel";
import { writeAudit } from "@/lib/audit";

export interface ImportReport {
  totalRows: number;
  created: number;
  updated: number;
  skippedExisting: number; // קיימים שדולגו כשנבחר "ייבא רק חדשים"
  failed: {
    rowNumber: number;
    errors: string[];
    name: string | null;
    data: Record<string, unknown>; // להשלמה ידנית
  }[];
  unmappedHeaders: string[];
}

/** אילו ת"ז מהשורות התקינות כבר קיימות במערכת — לזיהוי כפילויות בתצוגה המקדימה. */
export async function findExistingTaxIds(
  sql: Sql,
  parsed: ParsedWorkbook
): Promise<Set<string>> {
  const ids = parsed.rows
    .filter((r) => r.errors.length === 0 && r.data.tax_id)
    .map((r) => r.data.tax_id as string);
  if (ids.length === 0) return new Set();
  const rows = await sql`
    select tax_id from clients where tax_id in ${sql(ids)}
  `;
  return new Set(rows.map((r) => r.taxId as string));
}

// השדות שמותר לייבוא לכתוב. כל השאר — בבעלות המערכת ולא נדרס.
const IMPORTABLE_FIELDS: ExcelClientField[] = [
  "client_no",
  "tax_id",
  "name",
  "activity",
  "entity_type",
  "withholding_file",
  "spouse_name",
  "spouse_tax_id",
  "vat_frequency",
  "ni_102_frequency",
  "tax_102_frequency",
  "advances_rate",
  "advances_frequency",
  "permissions",
  "phone",
  "email",
  "is_active",
];

/**
 * מייבא את השורות התקינות מתוך קובץ שפוענח: יצירה או עדכון לפי tax_id.
 * שורות עם שגיאות מדווחות ואינן נכתבות. הכול בטרנזקציה אחת —
 * או שהייבוא כולו נקלט, או שכלום לא נכתב.
 */
export async function importClients(
  sql: Sql,
  parsed: ParsedWorkbook,
  opts: { actor: string; fileName?: string; updateExisting?: boolean }
): Promise<ImportReport> {
  const updateExisting = opts.updateExisting ?? true;
  const report: ImportReport = {
    totalRows: parsed.rows.length,
    created: 0,
    updated: 0,
    skippedExisting: 0,
    failed: [],
    unmappedHeaders: parsed.unmappedHeaders,
  };

  let validRows = parsed.rows.filter((r) => r.errors.length === 0);
  for (const r of parsed.rows) {
    if (r.errors.length > 0) {
      report.failed.push({
        rowNumber: r.rowNumber,
        errors: r.errors,
        name: (r.data.name as string) ?? null,
        data: r.data,
      });
    }
  }

  // "ייבא רק חדשים": שורות של לקוחות קיימים מדולגות ולא נדרסות
  if (!updateExisting) {
    const existing = await findExistingTaxIds(sql, parsed);
    report.skippedExisting = validRows.filter((r) =>
      existing.has(r.data.tax_id as string)
    ).length;
    validRows = validRows.filter(
      (r) => !existing.has(r.data.tax_id as string)
    );
  }

  await sql.begin(async (tx) => {
    for (const row of validRows) {
      const record: Record<string, unknown> = {};
      for (const f of IMPORTABLE_FIELDS) {
        if (f in row.data) record[f] = row.data[f] ?? null;
      }

      const updatable = Object.keys(record).filter((k) => k !== "tax_id");
      const inserted = await tx`
        insert into clients ${tx(record)}
        on conflict (tax_id) do update
        set ${tx(record, ...(updatable as (keyof typeof record)[]))}
        returning id, (xmax = 0) as is_new
      `;
      if (inserted[0].isNew) report.created++;
      else report.updated++;
    }

    await writeAudit(tx, {
      actor: opts.actor,
      action: "clients_import",
      entity: "clients",
      after: {
        file_name: opts.fileName ?? null,
        total: report.totalRows,
        created: report.created,
        updated: report.updated,
        skipped_existing: report.skippedExisting,
        failed: report.failed.length,
      },
    });
  });

  return report;
}
