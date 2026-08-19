import type { Sql } from "postgres";
import type { ParsedWorkbook, ExcelClientField } from "./excel";
import { writeAudit } from "@/lib/audit";

export interface ImportReport {
  totalRows: number;
  created: number;
  updated: number;
  failed: { rowNumber: number; errors: string[] }[];
  unmappedHeaders: string[];
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
  opts: { actor: string; fileName?: string }
): Promise<ImportReport> {
  const report: ImportReport = {
    totalRows: parsed.rows.length,
    created: 0,
    updated: 0,
    failed: [],
    unmappedHeaders: parsed.unmappedHeaders,
  };

  const validRows = parsed.rows.filter((r) => r.errors.length === 0);
  for (const r of parsed.rows) {
    if (r.errors.length > 0) {
      report.failed.push({ rowNumber: r.rowNumber, errors: r.errors });
    }
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
        failed: report.failed.length,
      },
    });
  });

  return report;
}
