import { describe, it, expect, beforeAll } from "vitest";
import {
  maskName,
  maskTaxId,
  maskFileNumber,
  maskPhone,
  maskEmail,
  maskBankKey,
  maskDetailsField,
  israeliChecksumValid,
} from "@/lib/masking/mask";
import {
  maskClientsExcel,
  maskBankCsvFile,
  encodeCp1255Text,
} from "@/lib/masking/files";
import { parseClientsWorkbook } from "@/lib/clients/excel";
import { parseBankCsv } from "@/lib/bank/csv";
import { parsePayerDetails, normalizeBankKey } from "@/lib/bank/payerParse";
import { buildFixtureWorkbook } from "./helpers/fixtureWorkbook";
import { buildBankCsvCp1255 } from "./helpers/fixtureBankCsv";

beforeAll(() => {
  process.env.MASKING_PEPPER = "test-pepper-0123456789abcdef";
});

describe("גזירה דטרמיניסטית", () => {
  it("אותו ערך ← תמיד אותו ערך בדוי; ערכים שונים ← שונים", () => {
    expect(maskName("ישראל ישראלי")).toBe(maskName("ישראל ישראלי"));
    expect(maskName("ישראל ישראלי")).not.toBe(maskName("דנה כהן-לוי"));
    expect(maskTaxId("034567890")).toBe(maskTaxId("034567890"));
    expect(maskBankKey("12-345-11111")).toBe(maskBankKey("12-345-11111"));
    expect(maskBankKey("12-345-11111")).not.toBe(maskBankKey("12-345-22222"));
  });

  it("pepper שונה משנה את התוצאה (אין גזירה גלויה מהערך)", () => {
    const a = maskName("ישראל ישראלי");
    process.env.MASKING_PEPPER = "another-pepper-9876543210fedcba";
    expect(maskName("ישראל ישראלי")).not.toBe(a);
    process.env.MASKING_PEPPER = "test-pepper-0123456789abcdef";
  });

  it("pepper חסר — שגיאה ברורה, לא מיסוך שקט", () => {
    const saved = process.env.MASKING_PEPPER;
    delete process.env.MASKING_PEPPER;
    expect(() => maskName("מישהו")).toThrow("MASKING_PEPPER");
    process.env.MASKING_PEPPER = saved;
  });
});

describe("מיסוך שדות", () => {
  it('ת"ז בדויה: 9 ספרות, ספרת ביקורת תקינה, ספרה ראשונה נשמרת', () => {
    const masked = maskTaxId("034567890");
    expect(masked).toMatch(/^\d{9}$/);
    expect(masked[0]).toBe("0");
    expect(israeliChecksumValid(masked)).toBe(true);
    expect(masked).not.toBe("034567890");

    const company = maskTaxId("515000002");
    expect(company[0]).toBe("5"); // ח"פ נשאר ח"פ
    expect(israeliChecksumValid(company)).toBe(true);
  });

  it("שם חברה מקבל שם חברה עם הסיומת; אדם מקבל שם פרטי+משפחה", () => {
    expect(maskName('מור לוי ושות בע"מ')).toContain('בע"מ');
    expect(maskName("אבי מזרחי")).toMatch(/^\S+ \S+$/);
    expect(maskName("אבי מזרחי")).not.toContain("מזרחי");
  });

  it("טלפון: קידומת, אורך ומפרידים נשמרים", () => {
    const masked = maskPhone("050-1234567");
    expect(masked).toMatch(/^050-\d{7}$/);
    expect(masked).not.toBe("050-1234567");
    expect(maskPhone("0501234567")).toHaveLength(10);
  });

  it("מספר תיק: אותו אורך; אימייל: בדוי לחלוטין", () => {
    expect(maskFileNumber("912000003")).toMatch(/^\d{9}$/);
    expect(maskEmail("real.person@gmail.com")).toMatch(
      /^user\d{6}@example\.co\.il$/
    );
  });

  it("בנק-סניף-חשבון: אותו פורמט מדויק", () => {
    const masked = maskBankKey("20-500-12345");
    expect(masked).toMatch(/^\d{2}-\d{3}-\d{5}$/);
    expect(masked).not.toBe("20-500-12345");
  });

  it('שדה "פרטים": התבנית נשמרת והפרסר מחלץ את הערכים הממוסכים', () => {
    const masked = maskDetailsField(
      "המבצע: אבי מזרחי עבור: שכר טרחה אוגוסט 20-500-12345"
    );
    expect(masked).toContain("המבצע: ");
    expect(masked).toContain(" עבור: שכר טרחה אוגוסט ");
    const parsed = parsePayerDetails(masked);
    expect(parsed?.payerName).toBe(maskName("אבי מזרחי"));
    expect(parsed?.bankKey).toBe(normalizeBankKey(maskBankKey("20-500-12345")));
    expect(parsed?.purpose).toBe("שכר טרחה אוגוסט"); // המטרה לא ממוסכת
  });
});

describe("מיסוך קובץ אקסל לקוחות", () => {
  it("שומר מבנה, ממסך מזהים, ונשאר קביל לייבוא", async () => {
    const original = await buildFixtureWorkbook();
    const masked = await maskClientsExcel(original);

    const parsedOrig = await parseClientsWorkbook(original);
    const parsedMasked = await parseClientsWorkbook(masked);

    // אותו מספר שורות, אותן שגיאות
    expect(parsedMasked.rows.length).toBe(parsedOrig.rows.length);
    expect(
      parsedMasked.rows.filter((r) => r.errors.length > 0).length
    ).toBe(parsedOrig.rows.filter((r) => r.errors.length > 0).length);

    for (let i = 0; i < parsedOrig.rows.length; i++) {
      const o = parsedOrig.rows[i].data;
      const m = parsedMasked.rows[i].data;
      if (o.name) {
        expect(m.name).toBe(maskName(o.name as string)); // עקבי
        expect(m.name).not.toBe(o.name); // ממוסך
      }
      if (o.tax_id) {
        expect(israeliChecksumValid(m.tax_id as string)).toBe(true);
      }
      // שדות לא-מזהים לא נגעו
      expect(m.activity).toBe(o.activity);
      expect(m.entity_type).toBe(o.entity_type);
      expect(m.advances_rate).toBe(o.advances_rate);
    }
  });

  it("מיסוך חוזר של אותו קובץ מחזיר בדיוק את אותם ערכים", async () => {
    const original = await buildFixtureWorkbook();
    const a = await parseClientsWorkbook(await maskClientsExcel(original));
    const b = await parseClientsWorkbook(await maskClientsExcel(original));
    expect(a.rows.map((r) => r.data)).toEqual(b.rows.map((r) => r.data));
  });
});

describe("מיסוך CSV בנקאי", () => {
  it("שומר קידוד cp1255, סכומים ותאריכים; ממסך משלמים ומפתחות", () => {
    const original = buildBankCsvCp1255();
    const maskedBuf = maskBankCsvFile(original);

    const orig = parseBankCsv(original);
    const masked = parseBankCsv(maskedBuf);

    expect(masked.encoding).toBe("windows-1255"); // הקידוד נשמר
    expect(masked.rows.length).toBe(orig.rows.length);
    expect(masked.debitRowsFiltered).toBe(orig.debitRowsFiltered);

    for (let i = 0; i < orig.rows.length; i++) {
      const o = orig.rows[i];
      const m = masked.rows[i];
      expect(m.credit).toBe(o.credit); // סכומים ללא שינוי
      expect(m.txnDate).toBe(o.txnDate); // תאריכים ללא שינוי
      expect(m.balanceAfter).toBe(o.balanceAfter);
      expect(m.reference).toBe(o.reference);
      if (o.details?.includes("המבצע")) {
        expect(m.details).not.toContain("ישראל ישראלי");
        expect(m.details).not.toContain("דנה כהן-לוי");
      }
    }
  });

  it("עקביות בין קבצים: אותו משלם ← אותו שם בדוי ואותו bank_key בדוי", () => {
    const masked = parseBankCsv(maskBankCsvFile(buildBankCsvCp1255()));
    const fakeDana = maskName("דנה כהן-לוי");
    const danaRows = masked.rows
      .map((r) => parsePayerDetails(r.details))
      .filter((p) => p?.payerName === fakeDana);
    expect(danaRows.length).toBe(2);
    expect(danaRows[0]!.bankKey).toBe(danaRows[1]!.bankKey);
    expect(danaRows[0]!.bankKey).toBe(
      normalizeBankKey(maskBankKey("12-345-22222"))
    );
  });

  it("קידוד cp1255: עברית עוברת הלוך ושוב", () => {
    const buf = encodeCp1255Text('בדיקה אבג "מרכאות" 123');
    const decoded = new TextDecoder("windows-1255").decode(buf);
    expect(decoded).toBe('בדיקה אבג "מרכאות" 123');
  });
});
