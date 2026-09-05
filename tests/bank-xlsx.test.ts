import { describe, it, expect, beforeAll } from "vitest";
import ExcelJS from "exceljs";
import { FIXTURE_LINES, buildBankCsvCp1255 } from "./helpers/fixtureBankCsv";
import { parseBankCsv, splitCsvLine } from "@/lib/bank/csv";
import { parseBankXlsx, parseBankFile } from "@/lib/bank/xlsx";
import { maskExcelFile } from "@/lib/masking/files";
import { maskName } from "@/lib/masking/mask";
import { parsePayerDetails } from "@/lib/bank/payerParse";
import { buildFixtureWorkbook } from "./helpers/fixtureWorkbook";

// בונה את אותו דף חשבון כמו הפיקסטורה, אבל כ-xlsx "אמיתי": תאריכים
// כתאי Date, סכומים כמספרים — כמו שהייצוא לאקסל מאתר הבנק נראה.
async function buildBankXlsx(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("תנועות");
  FIXTURE_LINES.forEach((line, i) => {
    const cells = splitCsvLine(line);
    const row = ws.getRow(i + 1);
    if (i < 2) {
      row.values = cells; // כותרת המסמך + שורת הכותרות — טקסט
      return;
    }
    row.values = cells.map((c, idx) => {
      if ((idx === 0 || idx === 5) && /^\d{2}\/\d{2}\/\d{4}$/.test(c)) {
        const [d, m, y] = c.split("/").map(Number);
        return new Date(Date.UTC(y, m - 1, d));
      }
      if (idx >= 6 && c !== "") return Number(c.replace(/,/g, ""));
      return c;
    });
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

let xlsx: Buffer;

beforeAll(async () => {
  process.env.MASKING_PEPPER = "test-pepper-0123456789abcdef";
  xlsx = await buildBankXlsx();
});

describe("דף חשבון בפורמט xlsx", () => {
  it("מפוענח לאותן תנועות בדיוק כמו ה-CSV — כולל row_hash זהה", async () => {
    const fromCsv = parseBankCsv(buildBankCsvCp1255());
    const fromXlsx = await parseBankXlsx(xlsx);

    expect(fromXlsx.encoding).toBe("xlsx");
    expect(fromXlsx.rows.length).toBe(fromCsv.rows.length);
    expect(fromXlsx.debitRowsFiltered).toBe(fromCsv.debitRowsFiltered);
    expect(fromXlsx.duplicatesInFile).toBe(fromCsv.duplicatesInFile);

    for (let i = 0; i < fromCsv.rows.length; i++) {
      const c = fromCsv.rows[i];
      const x = fromXlsx.rows[i];
      expect(x.txnDate).toBe(c.txnDate);
      expect(x.credit).toBe(c.credit);
      expect(x.balanceAfter).toBe(c.balanceAfter);
      expect(x.details).toBe(c.details);
      // אותה תנועה = אותו מפתח, בלי קשר לפורמט הייצוא
      expect(x.rowHash).toBe(c.rowHash);
    }
  });

  it("parseBankFile מפזר לפי סיומת", async () => {
    const a = await parseBankFile(xlsx, "תנועות.xlsx");
    expect(a.encoding).toBe("xlsx");
    const b = await parseBankFile(buildBankCsvCp1255(), "תנועות.csv");
    expect(b.encoding).toBe("windows-1255");
  });

  it("קובץ xlsx בלי כותרות בנק נדחה עם הסבר", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("x").getRow(1).values = ["א", "ב", "ג"];
    await expect(
      parseBankXlsx(Buffer.from(await wb.xlsx.writeBuffer()))
    ).rejects.toThrow("לא זוהתה שורת כותרות");
  });
});

describe("מיסוך xlsx — זיהוי אוטומטי", () => {
  it("דף חשבון xlsx: מזוהה כבנק, ממוסך, ונשאר קביל לפרסר", async () => {
    const { masked, kind } = await maskExcelFile(xlsx);
    expect(kind).toBe("bank");

    const orig = await parseBankXlsx(xlsx);
    const m = await parseBankXlsx(masked);
    expect(m.rows.length).toBe(orig.rows.length);
    for (let i = 0; i < orig.rows.length; i++) {
      expect(m.rows[i].credit).toBe(orig.rows[i].credit);
      expect(m.rows[i].txnDate).toBe(orig.rows[i].txnDate);
      if (orig.rows[i].details?.includes("המבצע")) {
        const p = parsePayerDetails(m.rows[i].details);
        expect(p).not.toBeNull();
        expect(m.rows[i].details).not.toContain("ישראל ישראלי");
      }
    }
    const israel = m.rows.find((r) =>
      r.details?.includes(maskName("ישראל ישראלי"))
    );
    expect(israel).toBeDefined();
  });

  it("דוח לקוחות xlsx: מזוהה כלקוחות", async () => {
    const { kind } = await maskExcelFile(await buildFixtureWorkbook());
    expect(kind).toBe("clients");
  });
});
