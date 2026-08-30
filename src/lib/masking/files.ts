import ExcelJS from "exceljs";
import { buildColumnMapping, type ExcelClientField } from "@/lib/clients/excel";
import { decodeBankFile } from "@/lib/bank/csv";
import {
  maskName,
  maskTaxId,
  maskFileNumber,
  maskPhone,
  maskEmail,
  maskDetailsField,
} from "./mask";

// מיסוך קבצים שלמים — הפלט באותו פורמט ובאותו קידוד בדיוק כמו המקור.
// שום דבר לא נשמר: קלט נכנס, פלט יוצא, וזהו.

// אילו שדות באקסל הלקוחות ממוסכים, ואיך
const EXCEL_FIELD_MASKERS: Partial<
  Record<ExcelClientField, (v: string) => string>
> = {
  name: maskName,
  spouse_name: maskName,
  tax_id: maskTaxId,
  spouse_tax_id: maskTaxId,
  withholding_file: maskFileNumber,
  phone: maskPhone,
  email: maskEmail,
};

/** ממסך קובץ אקסל לקוחות. מחזיר xlsx באותו מבנה בדיוק. */
export async function maskClientsExcel(buffer: Buffer): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("הקובץ ריק — לא נמצא גיליון");

  // איתור שורת הכותרות: השורה הראשונה עם לפחות 3 כותרות מוכרות
  let headerRowNumber = -1;
  let columns: { index: number; field: ExcelClientField | null }[] = [];
  for (let r = 1; r <= Math.min(ws.rowCount, 20); r++) {
    const cells: { index: number; header: string }[] = [];
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell, col) => {
      cells.push({ index: col, header: cell.text });
    });
    const mapping = buildColumnMapping(cells);
    if (mapping.columns.filter((c) => c.field).length >= 3) {
      headerRowNumber = r;
      columns = mapping.columns;
      break;
    }
  }
  if (headerRowNumber === -1) {
    throw new Error("לא זוהתה שורת כותרות — האם זה קובץ לקוחות?");
  }

  for (let r = headerRowNumber + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    for (const col of columns) {
      if (!col.field) continue;
      const masker = EXCEL_FIELD_MASKERS[col.field];
      if (!masker) continue;
      const cell = row.getCell(col.index);
      const original = cell.text;
      if (!original || !original.trim()) continue;
      const masked = masker(original.trim());
      // שומרים על טיפוס התא: מספר נשאר מספר (ת"ז שאקסל שומר כמספר)
      cell.value = typeof cell.value === "number" ? Number(masked) : masked;
    }
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** קידוד טקסט חזרה ל-windows-1255 (עברית, ASCII, פיסוק נפוץ). */
export function encodeCp1255Text(text: string): Buffer {
  const bytes: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code < 0x80) bytes.push(code);
    else if (code >= 0x05d0 && code <= 0x05ea) bytes.push(code - 0x05d0 + 0xe0);
    else if (ch === "״") bytes.push(0x22);
    else if (ch === "׳") bytes.push(0x27);
    else if (ch === "–" || ch === "—") bytes.push(0x2d);
    else if (code === 0x20aa) bytes.push(0xa4); // ₪
    else bytes.push(0x3f); // ?
  }
  return Buffer.from(bytes);
}

/**
 * ממסך CSV בנקאי: שם המשלם בשדה "פרטים" (בשמירה על תבנית
 * "המבצע… עבור…") וכל מפתח בנק-סניף-חשבון. סכומים, תאריכים,
 * אסמכתאות והמבנה — ללא שינוי. הפלט באותו קידוד כמו המקור.
 */
export function maskBankCsvFile(buffer: Buffer): Buffer {
  const { text, encoding } = decodeBankFile(buffer);
  const masked = text
    .split(/\r?\n/)
    .map((line) => (line.trim() ? maskDetailsField(line) : line))
    .join("\r\n");
  return encoding === "windows-1255"
    ? encodeCp1255Text(masked)
    : Buffer.from(masked, "utf8");
}
