import ExcelJS from "exceljs";

// קובץ אקסל ממוסך לבדיקות — מדמה את מבנה הקובץ של הלקוח:
// שורת כותרת עליונה "מיותרת", כותרות כפולות (מקדמות), עמודת "6" עלומה,
// ת"ז שאיבדו אפס מוביל, ושורות פגומות.
// אין כאן ולו נתון אמיתי אחד (כלל ברזל: נתונים ממוסכים בלבד).

export const FIXTURE_HEADERS = [
  "מספר לקוח",
  "מספר",
  "תיק ניכויים",
  "שם",
  "פעילות",
  "סוג",
  "בן זוג",
  "בן זוג2",
  "102 ביטוח לאומי",
  "102 מס הכנסה",
  "6",
  "מקדמות",
  "מקדמות",
  "מעמ",
  "הרשאות",
  "טלפון",
  "סטטוס",
];

export interface FixtureRow {
  values: (string | number | null)[];
  expectValid: boolean;
}

export const FIXTURE_ROWS: FixtureRow[] = [
  {
    // לקוח רגיל — ת"ז עם אפס מוביל שאקסל "אכל" (8 ספרות בקובץ)
    values: [1, 34567890, "912345678", "ישראל ישראלי", "ייעוץ עסקי", "מורשה",
      "רות ישראלי", 45678901, "חד חודשי", "חד חודשי", "x", "דו חודשי", 5.5,
      "דו חודשי", "מלאות", "0501234567", "פעיל"],
    expectValid: true,
  },
  {
    // חברה בע"מ
    values: [2, 515555555, "934567890", 'בדיקה אחזקות בע"מ', "נדל\"ן", "חברה",
      null, null, "חד חודשי", "חד חודשי", null, "חד חודשי", 0,
      "חד חודשי", "חלקיות", "03-5556677", "פעיל"],
    expectValid: true,
  },
  {
    // עוסק פטור, לא פעיל
    values: [3, 123456782, null, "דנה כהן-לוי", "עיצוב גרפי", "פטור",
      null, null, null, null, null, null, null, "פטור", null,
      "+972-52-000-1122", "לא פעיל"],
    expectValid: true,
  },
  {
    // שורה פגומה — חסר ת"ז
    values: [4, null, null, "לקוח בלי מספר", "הובלות", "מורשה",
      null, null, null, null, null, null, null, null, null, null, "פעיל"],
    expectValid: false,
  },
  {
    // שורה פגומה — ת"ז כפול (של שורה 1)
    values: [5, 34567890, null, "כפיל של ישראלי", null, "מורשה",
      null, null, null, null, null, null, null, null, null, null, "פעיל"],
    expectValid: false,
  },
  {
    // שורה פגומה — חסר שם
    values: [6, 999888777, null, null, null, "מורשה",
      null, null, null, null, null, null, null, null, null, null, "פעיל"],
    expectValid: false,
  },
  {
    // ת"ז קצר במיוחד (ותיק) — 5 ספרות, אמור להתקבל עם ריפוד אפסים
    values: [7, 54321, null, "משה ותיק", "חקלאות", "מורשה",
      null, null, null, null, null, null, null, null, null, null, null],
    expectValid: true,
  },
];

export const EXPECTED_VALID_COUNT = FIXTURE_ROWS.filter(
  (r) => r.expectValid
).length;
export const EXPECTED_FAILED_COUNT = FIXTURE_ROWS.length -
  EXPECTED_VALID_COUNT;

export async function buildFixtureWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("לקוחות", { views: [{ rightToLeft: true }] });

  // שורת "כותרת מסמך" מעל שורת הכותרות — כמו בקבצים אמיתיים
  ws.getRow(1).values = ["רשימת לקוחות — משרד רו\"ח (נתוני בדיקה)"];
  ws.getRow(2).values = FIXTURE_HEADERS;
  FIXTURE_ROWS.forEach((row, i) => {
    ws.getRow(3 + i).values = row.values.map((v) => (v === null ? "" : v));
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
