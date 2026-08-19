import ExcelJS from "exceljs";
import type { Sql } from "postgres";

// ייצוא חזרה לאקסל — האקסל של הלקוח הוא מקור האמת, המערכת לא מחליפה אותו.
// סדר העמודות תואם את הקובץ המקורי של הלקוח.
const EXPORT_COLUMNS: { header: string; key: string; width?: number }[] = [
  { header: "מספר לקוח", key: "clientNo", width: 10 },
  { header: "מספר", key: "taxId", width: 12 },
  { header: "תיק ניכויים", key: "withholdingFile", width: 12 },
  { header: "שם", key: "name", width: 24 },
  { header: "פעילות", key: "activity", width: 18 },
  { header: "סוג", key: "entityType", width: 10 },
  { header: "בן זוג", key: "spouseName", width: 16 },
  { header: "בן זוג2", key: "spouseTaxId", width: 12 },
  { header: "102 ביטוח לאומי", key: "ni102Frequency", width: 14 },
  { header: "102 מס הכנסה", key: "tax102Frequency", width: 14 },
  { header: "מקדמות", key: "advancesRate", width: 10 },
  { header: "מקדמות", key: "advancesFrequency", width: 10 },
  { header: "מעמ", key: "vatFrequency", width: 10 },
  { header: "הרשאות", key: "permissions", width: 14 },
  { header: "טלפון", key: "phone", width: 14 },
  { header: "אימייל", key: "email", width: 22 },
  { header: "סטטוס", key: "status", width: 10 },
];

export async function exportClientsWorkbook(sql: Sql): Promise<Buffer> {
  const clients = await sql`
    select * from clients order by client_no nulls last, name
  `;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("לקוחות", {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
  });

  // exceljs לא מרשה key כפול, לכן הכותרות נכתבות ידנית
  ws.getRow(1).values = EXPORT_COLUMNS.map((c) => c.header);
  ws.getRow(1).font = { bold: true };
  EXPORT_COLUMNS.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width ?? 12;
  });

  for (const c of clients) {
    ws.addRow(
      EXPORT_COLUMNS.map((col) => {
        if (col.key === "status") return c.isActive ? "פעיל" : "לא פעיל";
        const v = c[col.key];
        return v === null || v === undefined ? "" : v;
      })
    );
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
