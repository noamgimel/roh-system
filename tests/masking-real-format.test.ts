import { describe, it, expect, beforeAll } from "vitest";
import ExcelJS from "exceljs";
import {
  maskDetailsField,
  maskFreeText,
  maskTaxId,
  maskName,
  israeliChecksumValid,
} from "@/lib/masking/mask";
import { maskExcelFile } from "@/lib/masking/files";
import { parseBankXlsx } from "@/lib/bank/xlsx";
import { mapBankHeaders } from "@/lib/bank/csv";
import { parsePayerDetails } from "@/lib/bank/payerParse";

// הפורמט האמיתי של ייצוא ה-xlsx מאתר הפועלים, כפי שנלמד מדוח הצורה
// (בלי תוכן אמיתי): כותרות שונות מהמפרט, תאריכים כתאי Date, ושדה
// "פרטים" שמכיל ת"ז של המשלם במקום בנק-סניף-חשבון.

const REAL_HEADERS = [
  "תאריך", "קוד פעולה", "הפעולה", "פרטים", "אסמכתא", "צרור",
  "חובה", "זכות", "יתרה בש''ח", "הערה",
];

async function buildRealFormatXlsx(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("תנועות1");
  ws.getRow(3).values = ["תנועות בחשבון"];
  ws.getRow(4).values = ["משרד פלוני בעמ  12-345-678901  תקופה:  01.08.2026 - 31.08.2026"];
  ws.getRow(5).values = REAL_HEADERS;
  const d = (day: number) => new Date(Date.UTC(2026, 7, day));
  ws.getRow(6).values = [d(3), 105, "העברה", "המבצע: משה כהן עבור: שכר טרחה אוגוסט (מס ת-ז:012345675", 4471, 0, null, 1200, 45200.5, null];
  ws.getRow(7).values = [d(4), 105, "זהב-העברה", "  עבור: יעל לוי חשבונית 88  .", 4472, 0, null, 950, 46150.5, "הערה עם שם: דני"];
  ws.getRow(8).values = [d(5), 210, "אמריקן אקספרס", "חיוב כרטיס", 4473, 0, 1850, null, 44300.5, null];
  ws.getRow(9).values = [d(6), 105, "העברה", "המבצע: משה כהן עבור: מקדמה 12-345-11111", 4474, 0, null, 800, 45100.5, null];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

beforeAll(() => {
  process.env.MASKING_PEPPER = "test-pepper-0123456789abcdef";
});

describe("מיסוך — הפורמט האמיתי של הפועלים", () => {
  it("ת\"ז בתוך שדה הפרטים ממוסכת (עם ספרת ביקורת) — התבנית נשמרת", () => {
    const masked = maskDetailsField(
      "המבצע: משה כהן עבור: שכר טרחה אוגוסט (מס ת-ז:012345675"
    );
    expect(masked).not.toContain("012345675");
    expect(masked).not.toContain("משה כהן");
    expect(masked).toContain("עבור: שכר טרחה אוגוסט (מס ת-ז:");
    const id = masked.match(/\d{9}/)![0];
    expect(israeliChecksumValid(id)).toBe(true);
    expect(id).toBe(maskTaxId("012345675")); // עקבי עם מיסוך האקסל
    expect(parsePayerDetails(masked)?.payerName).toBe(maskName("משה כהן"));
  });

  it("טקסט חופשי בלי 'המבצע': שמות מוחלפים, מילים תפעוליות נשמרות", () => {
    const masked = maskDetailsField("  עבור: יעל לוי חשבונית 88  .");
    expect(masked).not.toContain("יעל");
    expect(masked).not.toContain("לוי");
    expect(masked).toContain("עבור:");
    expect(masked).toContain("חשבונית 88");
    expect(maskFreeText("שכר טרחה אוגוסט")).toBe("שכר טרחה אוגוסט");
  });

  it("הכותרות האמיתיות ממופות (כולל יתרה בש''ח והפעולה)", () => {
    const map = mapBankHeaders(REAL_HEADERS);
    const fields = map.map((m) => m.field);
    expect(fields).toContain("txnDate");
    expect(fields).toContain("description");
    expect(fields).toContain("details");
    expect(fields).toContain("reference");
    expect(fields).toContain("credit");
    expect(fields).toContain("balanceAfter");
  });

  it("קובץ בפורמט האמיתי: נקלט, ממוסך במלואו, ונשאר קביל לפרסר", async () => {
    const original = await buildRealFormatXlsx();

    // הפרסר קורא את הפורמט האמיתי
    const parsedOrig = await parseBankXlsx(original);
    expect(parsedOrig.rows.length).toBe(3); // 3 זכות, 1 חובה סוננה
    expect(parsedOrig.rows[0].txnDate).toBe("2026-08-03");
    expect(parsedOrig.rows[0].credit).toBe("1200.00");
    expect(parsedOrig.rows[0].balanceAfter).toBe("45200.50");

    // המיסוך מזהה דף חשבון וממסך הכול
    const { masked, kind } = await maskExcelFile(original);
    expect(kind).toBe("bank");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(masked as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    let allText = "";
    ws.eachRow((row) => row.eachCell((cell) => { allText += " " + cell.text; }));
    for (const leak of ["משה כהן", "יעל", "012345675", "12-345-11111", "12-345-678901", "דני", "פלוני"]) {
      expect(allText).not.toContain(leak);
    }
    // מה שצריך להישאר לכיול נשאר
    expect(allText).toContain("אמריקן אקספרס");
    expect(allText).toContain("זהב-העברה");
    expect(allText).toContain("שכר טרחה אוגוסט");
    expect(allText).toContain("יתרה בש''ח");

    // הקובץ הממוסך נקלט זהה מבחינת סכומים ותאריכים
    const parsedMasked = await parseBankXlsx(masked);
    expect(parsedMasked.rows.map((r) => [r.txnDate, r.credit])).toEqual(
      parsedOrig.rows.map((r) => [r.txnDate, r.credit])
    );
  });
});
