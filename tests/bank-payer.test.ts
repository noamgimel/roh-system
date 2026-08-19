import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Sql } from "postgres";
import { freshTestDb } from "./helpers/testDb";
import { buildBankCsvCp1255, EXPECTED } from "./helpers/fixtureBankCsv";
import { parseBankCsv } from "@/lib/bank/csv";
import { commitBankFile } from "@/lib/bank/import";
import {
  parsePayerDetails,
  normalizeBankKey,
} from "@/lib/bank/payerParse";

let sql: Sql;

beforeAll(async () => {
  sql = await freshTestDb();
});

afterAll(async () => {
  await sql.end();
});

describe("פרסר המשלם — שדה פרטים", () => {
  it("התבנית המלאה: המבצע + עבור + בנק-סניף-חשבון", () => {
    const p = parsePayerDetails(
      "המבצע: ישראל ישראלי עבור: אוגוסט 12-345-11111"
    );
    expect(p).toEqual({
      payerName: "ישראל ישראלי",
      purpose: "אוגוסט",
      bankKey: "12-345-11111",
    });
  });

  it("בלי עבור: — שם משלם וחשבון בלבד", () => {
    const p = parsePayerDetails("המבצע: משה ותיק 05-012-0044444");
    expect(p?.payerName).toBe("משה ותיק");
    expect(p?.purpose).toBeNull();
    expect(p?.bankKey).toBe("5-12-44444");
  });

  it("בלי חשבון בסוף — שם ומטרה בלבד", () => {
    const p = parsePayerDetails('המבצע: בדיקה אחזקות בע"מ עבור: ריטיינר יולי');
    expect(p?.payerName).toBe('בדיקה אחזקות בע"מ');
    expect(p?.purpose).toBe("ריטיינר יולי");
    expect(p?.bankKey).toBeNull();
  });

  it("עבור ריק — מטרה null", () => {
    const p = parsePayerDetails("המבצע: דנה כהן-לוי עבור: 12-345-22222");
    expect(p?.payerName).toBe("דנה כהן-לוי");
    expect(p?.purpose).toBeNull();
    expect(p?.bankKey).toBe("12-345-22222");
  });

  it("רווחים כפולים ותווי קצה אינם מפריעים", () => {
    const p = parsePayerDetails(
      "  המבצע:   ישראל   ישראלי   עבור:  אוגוסט   12-345-11111  "
    );
    expect(p?.payerName).toBe("ישראל ישראלי");
    expect(p?.bankKey).toBe("12-345-11111");
  });

  it("טקסט שלא עומד בתבנית — מחזיר null ולא נכשל", () => {
    expect(parsePayerDetails("הפקדת מזומן בסניף")).toBeNull();
    expect(parsePayerDetails("")).toBeNull();
    expect(parsePayerDetails(null)).toBeNull();
    expect(parsePayerDetails("המבצע: ")).toBeNull();
  });

  it("נרמול bank_key: אפסים מוליכים מוסרים מכל מקטע", () => {
    expect(normalizeBankKey("05-012-0044444")).toBe("5-12-44444");
    expect(normalizeBankKey("12-345-11111")).toBe("12-345-11111");
    expect(normalizeBankKey("0-00-0000")).toBe("0-0-0");
  });
});

describe("שילוב בצינור הקליטה", () => {
  it("קליטה ממלאה את שדות המשלם; שורה בלי תבנית נשארת ריקה", async () => {
    const parsed = parseBankCsv(buildBankCsvCp1255());
    await commitBankFile(sql, parsed, { actor: "test", fileName: "bank.csv" });

    const withPayer = await sql`
      select * from bank_transactions
      where status = 'new' and parsed_payer_name is not null
    `;
    expect(withPayer.length).toBe(EXPECTED.parsedPayers);

    // bank_key מנורמל נשמר (כולל הווריאציה עם אפסים מוליכים)
    const keys = withPayer.map((r) => r.parsedBankKey);
    expect(keys).toContain("12-345-11111");
    expect(keys).toContain("5-12-44444");

    // השורה ללא תבנית — נקלטה, ללא משלם, בסטטוס new (לתור הידני)
    const [unparsed] = await sql`
      select * from bank_transactions
      where details = 'הפקדת מזומן בסניף'
    `;
    expect(unparsed).toBeDefined();
    expect(unparsed.status).toBe("new");
    expect(unparsed.parsedPayerName).toBeNull();
    expect(unparsed.parsedBankKey).toBeNull();
  });

  it("שתי תנועות של אותו משלם חולקות bank_key זהה — הבסיס להתאמה", async () => {
    const rows = await sql`
      select parsed_bank_key from bank_transactions
      where parsed_payer_name = 'דנה כהן-לוי'
    `;
    expect(rows.length).toBe(2);
    expect(rows[0].parsedBankKey).toBe(rows[1].parsedBankKey);
  });
});
