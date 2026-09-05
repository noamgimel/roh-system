import { describe, it, expect, beforeAll } from "vitest";
import ExcelJS from "exceljs";
import { parseClientsWorkbook } from "@/lib/clients/excel";
import { maskExcelFile } from "@/lib/masking/files";
import { FIXTURE_HEADERS, FIXTURE_ROWS } from "./helpers/fixtureWorkbook";

// חוברת כמו של הלקוח: כמה גיליונות, ורק אחד מהם הוא "נתוני לקוחות".
// המערכת חייבת למצוא אותו לבד — ובמיסוך, לזרוק את כל השאר.

async function buildMultiSheetWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const junk1 = wb.addWorksheet("מענק שאגת הארי");
  junk1.getRow(1).values = ["שם המקבל", "סכום המענק", "הערות סודיות"];
  junk1.getRow(2).values = ["פלוני אלמוני", 12000, "מידע שלא אמור לדלוף"];

  const clients = wb.addWorksheet("נתוני לקוחות ראיית חשבון");
  clients.getRow(1).values = ["רשימת לקוחות"];
  clients.getRow(2).values = FIXTURE_HEADERS;
  FIXTURE_ROWS.forEach((row, i) => {
    clients.getRow(3 + i).values = row.values.map((v) => (v === null ? "" : v));
  });

  const junk2 = wb.addWorksheet("דיווחים 2026");
  junk2.getRow(1).values = ["חודש", "דווח", "סכום"];
  junk2.getRow(2).values = ["ינואר", "כן", 999];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

beforeAll(() => {
  process.env.MASKING_PEPPER = "test-pepper-0123456789abcdef";
});

describe("חוברת עם כמה גיליונות", () => {
  it("הייבוא מוצא את גיליון הלקוחות גם כשהוא לא הראשון", async () => {
    const parsed = await parseClientsWorkbook(await buildMultiSheetWorkbook());
    expect(parsed.headerRowNumber).toBe(2);
    expect(parsed.rows.length).toBe(FIXTURE_ROWS.length);
  });

  it("המיסוך משאיר רק את גיליון הלקוחות — הגיליונות האחרים לא דולפים", async () => {
    const { masked, kind } = await maskExcelFile(await buildMultiSheetWorkbook());
    expect(kind).toBe("clients");

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(masked as unknown as ArrayBuffer);
    expect(wb.worksheets.length).toBe(1);
    expect(wb.worksheets[0].name).toBe("נתוני לקוחות ראיית חשבון");

    let allText = "";
    wb.worksheets[0].eachRow((row) => row.eachCell((c) => { allText += " " + c.text; }));
    expect(allText).not.toContain("פלוני אלמוני");
    expect(allText).not.toContain("מידע שלא אמור לדלוף");
    expect(allText).not.toContain("ישראל ישראלי"); // ממוסך
  });
});
