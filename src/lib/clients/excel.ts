import ExcelJS from "exceljs";
import {
  normalizeTaxId,
  normalizePhone,
  normalizeText,
  normalizeNumber,
  normalizeIsActive,
} from "./normalize";

// השדות שהאקסל של הלקוח מנהל. שדות שהמערכת מנהלת (תעריף, יתרת פתיחה,
// סוג לקוח, מזהה אצל ספק ההנפקה) לעולם לא נקראים מהאקסל ולא נדרסים בייבוא.
export type ExcelClientField =
  | "client_no"
  | "tax_id"
  | "name"
  | "activity"
  | "entity_type"
  | "withholding_file"
  | "spouse_name"
  | "spouse_tax_id"
  | "vat_frequency"
  | "ni_102_frequency"
  | "tax_102_frequency"
  | "advances_rate"
  | "advances_frequency"
  | "permissions"
  | "phone"
  | "email"
  | "rate" // תעריף חודשי — נקלט רק אם העמודה קיימת בקובץ
  | "is_active";

export interface ParsedClientRow {
  rowNumber: number; // מספר השורה בקובץ המקורי, לדוח השגיאות
  data: Partial<Record<ExcelClientField, unknown>>;
  errors: string[];
}

export interface ColumnMapping {
  index: number; // אינדקס עמודה בקובץ (1-based, כמו exceljs)
  header: string;
  field: ExcelClientField | null; // null = עמודה לא ממופה
}

export interface ParsedWorkbook {
  headerRowNumber: number;
  columns: ColumnMapping[];
  unmappedHeaders: string[];
  rows: ParsedClientRow[];
}

// מיפוי כותרת → שדה. כותרות שחוזרות פעמיים ("מקדמות") ממופות לפי סדר הופעה.
// עמודת "6" מהאקסל של הלקוח נשארת לא ממופה עד שתתברר משמעותה (סעיף 15.7 באפיון).
const HEADER_MAP: Record<string, ExcelClientField | ExcelClientField[]> = {
  "מספר לקוח": "client_no",
  "מספר": "tax_id",
  "תיק ניכויים": "withholding_file",
  "שם": "name",
  "פעילות": "activity",
  "סוג": "entity_type",
  "בן זוג": "spouse_name",
  "בן זוג2": "spouse_tax_id",
  "102 ביטוח לאומי": "ni_102_frequency",
  "102 מס הכנסה": "tax_102_frequency",
  "מעמ": "vat_frequency",
  'מע"מ': "vat_frequency",
  "מקדמות": ["advances_rate", "advances_frequency"],
  "הרשאות": "permissions",
  "טלפון": "phone",
  "אימייל": "email",
  "מייל": "email",
  "תעריף": "rate",
  "תעריף חודשי": "rate",
  "סטטוס": "is_active",
};

function cleanHeader(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** מזהה את שורת הכותרות: השורה הראשונה שבה לפחות 3 כותרות מוכרות. */
function findHeaderRow(ws: ExcelJS.Worksheet): number | null {
  for (let r = 1; r <= Math.min(ws.rowCount, 20); r++) {
    const row = ws.getRow(r);
    let hits = 0;
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (HEADER_MAP[cleanHeader(cell.text)]) hits++;
    });
    if (hits >= 3) return r;
  }
  return null;
}

/** בונה את מיפוי העמודות משורת הכותרות, כולל טיפול בכותרות כפולות. */
export function buildColumnMapping(headers: { index: number; header: string }[]): {
  columns: ColumnMapping[];
  unmappedHeaders: string[];
} {
  const seen: Record<string, number> = {};
  const usedFields = new Set<ExcelClientField>();
  const columns: ColumnMapping[] = [];
  const unmappedHeaders: string[] = [];

  for (const { index, header } of headers) {
    const clean = cleanHeader(header);
    if (!clean) continue;
    const mapped = HEADER_MAP[clean];
    let field: ExcelClientField | null = null;

    if (Array.isArray(mapped)) {
      const occurrence = seen[clean] ?? 0;
      field = mapped[occurrence] ?? null;
      seen[clean] = occurrence + 1;
    } else if (mapped) {
      field = mapped;
    }

    // אותה כותרת פעמיים כשמצופה פעם אחת — ההופעה השנייה לא ממופה
    if (field && usedFields.has(field)) field = null;
    if (field) usedFields.add(field);
    else unmappedHeaders.push(clean);

    columns.push({ index, header: clean, field });
  }
  return { columns, unmappedHeaders };
}

function parseCell(field: ExcelClientField, raw: unknown): unknown {
  switch (field) {
    case "client_no": {
      const n = normalizeNumber(raw);
      return n === null ? null : Math.trunc(n);
    }
    case "tax_id":
    case "spouse_tax_id":
      return normalizeTaxId(raw);
    case "advances_rate":
    case "rate":
      return normalizeNumber(raw);
    case "phone":
      return normalizePhone(raw);
    case "is_active":
      return normalizeIsActive(raw);
    default:
      return normalizeText(raw);
  }
}

/**
 * פענוח קובץ אקסל של לקוחות: זיהוי כותרות, מיפוי עמודות, נרמול וולידציה.
 * שורה שנכשלת מדווחת ב-errors ואינה מפילה את הקובץ כולו.
 */
export async function parseClientsWorkbook(
  buffer: Buffer | ArrayBuffer
): Promise<ParsedWorkbook> {
  const wb = new ExcelJS.Workbook();
  // exceljs מצהיר על טיפוס Buffer ישן — ההמרה בטוחה בפועל
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  if (wb.worksheets.length === 0) throw new Error("הקובץ ריק — לא נמצא גיליון");

  // חוברת עם כמה גיליונות: בוחרים את הראשון שיש בו כותרות לקוחות
  let ws: ExcelJS.Worksheet | null = null;
  let headerRowNumber: number | null = null;
  for (const candidate of wb.worksheets) {
    const found = findHeaderRow(candidate);
    if (found !== null) {
      ws = candidate;
      headerRowNumber = found;
      break;
    }
  }
  if (!ws || headerRowNumber === null) {
    throw new Error(
      "לא זוהתה שורת כותרות באף גיליון — ודא שהקובץ מכיל את העמודות המוכרות (שם, מספר וכו')"
    );
  }

  const headerCells: { index: number; header: string }[] = [];
  ws.getRow(headerRowNumber).eachCell({ includeEmpty: false }, (cell, col) => {
    headerCells.push({ index: col, header: cell.text });
  });
  const { columns, unmappedHeaders } = buildColumnMapping(headerCells);

  const rows: ParsedClientRow[] = [];
  const seenTaxIds = new Map<string, number>(); // ת"ז → שורה ראשונה שבה הופיעה

  for (let r = headerRowNumber + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    // דילוג על שורות ריקות לחלוטין
    let empty = true;
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (cleanHeader(cell.text)) empty = false;
    });
    if (empty) continue;

    const data: Partial<Record<ExcelClientField, unknown>> = {};
    const errors: string[] = [];

    for (const col of columns) {
      if (!col.field) continue;
      const raw = row.getCell(col.index).text;
      data[col.field] = parseCell(col.field, raw === "" ? null : raw);
    }

    // ולידציה
    const rawTaxId = columns.find((c) => c.field === "tax_id")
      ? row.getCell(columns.find((c) => c.field === "tax_id")!.index).text
      : "";
    if (!data.tax_id) {
      errors.push(
        rawTaxId?.trim()
          ? `מספר ת"ז/ח"פ לא תקין: "${rawTaxId.trim()}"`
          : 'חסר מספר ת"ז/ח"פ'
      );
    }
    if (!data.name) errors.push("חסר שם לקוח");

    if (data.tax_id) {
      const firstRow = seenTaxIds.get(data.tax_id as string);
      if (firstRow !== undefined) {
        errors.push(`ת"ז/ח"פ כפול בקובץ — הופיע כבר בשורה ${firstRow}`);
      } else {
        seenTaxIds.set(data.tax_id as string, r);
      }
    }

    rows.push({ rowNumber: r, data, errors });
  }

  return { headerRowNumber, columns, unmappedHeaders, rows };
}
