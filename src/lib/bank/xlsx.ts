import ExcelJS from "exceljs";
import { parseBankTable, parseBankCsv, type ParsedBankFile } from "./csv";

// דף חשבון בפורמט xlsx (הייצוא לאקסל מאתר הבנק) — מומר לטבלת תאים
// ומוזן לאותה ליבה כמו ה-CSV. תאריכים ומספרים מנורמלים למחרוזות
// בפורמט שהפרסר מכיר.

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** תא של exceljs → מחרוזת בפורמט שהפרסר של ה-CSV מצפה לו */
export function cellToText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    // אקסל שומר תאריכים ב-UTC — קוראים כ-UTC כדי לא לזוז יום
    return `${pad2(v.getUTCDate())}/${pad2(v.getUTCMonth() + 1)}/${v.getUTCFullYear()}`;
  }
  if (typeof v === "number") return String(v);
  if (typeof v === "object") {
    // נוסחה / טקסט עשיר — exceljs מספק את התוצאה המוצגת
    const r = (v as { result?: unknown }).result;
    if (r instanceof Date) {
      return `${pad2(r.getUTCDate())}/${pad2(r.getUTCMonth() + 1)}/${r.getUTCFullYear()}`;
    }
    if (typeof r === "number") return String(r);
    return cell.text ?? "";
  }
  return String(v);
}

/** גיליון → טבלת מחרוזות (1-based של exceljs ← 0-based) */
export function worksheetToTable(ws: ExcelJS.Worksheet): string[][] {
  const table: string[][] = [];
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const cells: string[] = [];
    for (let c = 1; c <= (row.cellCount || ws.columnCount); c++) {
      cells.push(cellToText(row.getCell(c)));
    }
    table.push(cells);
  }
  return table;
}

export async function parseBankXlsx(buffer: Buffer): Promise<ParsedBankFile> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("הקובץ ריק — לא נמצא גיליון");
  return parseBankTable(worksheetToTable(ws), "xlsx");
}

/** מפזר לפי סיומת הקובץ — הנקודה היחידה שהשאר צריך להכיר. */
export async function parseBankFile(
  buffer: Buffer,
  fileName: string
): Promise<ParsedBankFile> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    return parseBankXlsx(buffer);
  }
  return parseBankCsv(buffer);
}
