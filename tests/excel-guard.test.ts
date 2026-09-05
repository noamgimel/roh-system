import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { describeNotXlsx, isXlsxBuffer, looksLikeCsv } from "@/lib/excel-guard";
import { buildBankCsvCp1255 } from "./helpers/fixtureBankCsv";

describe("זיהוי קבצים שאינם xlsx אמיתיים", () => {
  it("חוברת אקסל אמיתית עוברת — גם בלי סיומת", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("x").getRow(1).values = ["שם", "מספר", "טלפון"];
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    expect(describeNotXlsx(buf, "a.xlsx")).toBeNull();
    expect(isXlsxBuffer(buf)).toBe(true); // לפי תוכן — השם לא משנה
    expect(looksLikeCsv(buf)).toBe(false);
  });

  it("CSV בנקאי (cp1255) מזוהה כ-CSV לפי תוכן", () => {
    const csv = buildBankCsvCp1255();
    expect(looksLikeCsv(csv)).toBe(true);
    expect(isXlsxBuffer(csv)).toBe(false);
  });

  it("קובץ Numbers עם סיומת xlsx מזוהה ומקבל הוראה לייצא", () => {
    // ארכיון zip מזויף עם מבנה של Numbers
    const fake = Buffer.concat([
      Buffer.from("504b0304", "hex"),
      Buffer.from("....Index/Document.iwa....Metadata/Properties.plist"),
    ]);
    expect(describeNotXlsx(fake, "clients.xlsx")).toContain("Numbers");
    expect(describeNotXlsx(fake, "clients.xlsx")).toContain("ייצא");
  });

  it("קובץ מוצפן (OLE) מוסבר", () => {
    const ole = Buffer.concat([Buffer.from("d0cf11e0", "hex"), Buffer.alloc(64)]);
    expect(describeNotXlsx(ole, "locked.xlsx")).toContain("סיסמה");
  });

  it("קובץ שאינו zip כלל", () => {
    expect(describeNotXlsx(Buffer.from("hello"), "x.xlsx")).toContain("אינו קובץ xlsx");
  });
});
