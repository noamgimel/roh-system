import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Sql } from "postgres";
import { freshTestDb } from "./helpers/testDb";
import {
  buildBankCsvCp1255,
  buildBankCsvUtf8,
  EXPECTED,
} from "./helpers/fixtureBankCsv";
import {
  parseBankCsv,
  parseIsraeliDate,
  parseAmount,
  splitCsvLine,
  computeRowHash,
} from "@/lib/bank/csv";
import {
  previewBankFile,
  commitBankFile,
  setTransactionIgnored,
} from "@/lib/bank/import";

let sql: Sql;

beforeAll(async () => {
  sql = await freshTestDb();
});

afterAll(async () => {
  await sql.end();
});

describe("פענוח CSV בנקאי", () => {
  it("מפענח קידוד windows-1255 אמיתי", () => {
    const parsed = parseBankCsv(buildBankCsvCp1255());
    expect(parsed.encoding).toBe("windows-1255");
    expect(
      parsed.rows.some((r) => r.details?.includes("ישראל ישראלי"))
    ).toBe(true);
  });

  it("מפענח גם UTF-8 (קובץ שנשמר מחדש)", () => {
    const parsed = parseBankCsv(buildBankCsvUtf8());
    expect(parsed.encoding).toBe("utf-8");
    expect(parsed.rows).toHaveLength(EXPECTED.creditRowsUnique);
  });

  it("מסנן שורות חובה ומדלג על שורת הכותרת העליונה", () => {
    const parsed = parseBankCsv(buildBankCsvCp1255());
    expect(parsed.headerRowNumber).toBe(2);
    expect(parsed.debitRowsFiltered).toBe(EXPECTED.debitFiltered);
    expect(parsed.rows).toHaveLength(EXPECTED.creditRowsUnique);
  });

  it("גרש באמצע שדה (זה\"ב) אינו שובר את הפרסור", () => {
    const cells = splitCsvLine(
      '14/08/2026,העברת זה"ב,פרטים כלשהם,12-345,900014,14/08/2026,,1500.00,"42,200.00"'
    );
    expect(cells[1]).toBe('העברת זה"ב');
    expect(cells[8]).toBe("42,200.00");
  });

  it("שתי תנועות זהות באותו יום עם יתרה שונה מקבלות hash שונה", () => {
    const base = {
      account: "12-345-67890",
      txnDate: "2026-08-11",
      reference: "900011",
      credit: "950.00",
    };
    const h1 = computeRowHash({ ...base, balanceAfter: "39000.00" });
    const h2 = computeRowHash({ ...base, balanceAfter: "38050.00" });
    expect(h1).not.toBe(h2);
  });

  it("שורה זהה לחלוטין בתוך הקובץ מזוהה ככפולה", () => {
    const parsed = parseBankCsv(buildBankCsvCp1255());
    expect(parsed.duplicatesInFile).toBe(EXPECTED.duplicatesInFile);
  });

  it("ממיין לסדר כרונולוגי עולה גם כשהקובץ יורד", () => {
    const parsed = parseBankCsv(buildBankCsvCp1255());
    const dates = parsed.rows.map((r) => r.txnDate);
    expect(dates).toEqual([...dates].sort());
    expect(dates[0]).toBe("2026-08-05");
  });

  it("עזרי פרסור: תאריך ישראלי וסכומים", () => {
    expect(parseIsraeliDate("05/08/2026")).toBe("2026-08-05");
    expect(parseIsraeliDate("5/8/26")).toBe("2026-08-05");
    expect(parseIsraeliDate("32/01/2026")).toBeNull();
    expect(parseAmount("1,234.56")).toBe("1234.56");
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("0.00")).toBeNull();
  });
});

describe("קליטה ל-DB", () => {
  it("תצוגה מקדימה: חדשות / מוחרגות אוטומטית, בלי כתיבה ל-DB", async () => {
    const parsed = parseBankCsv(buildBankCsvCp1255());
    const preview = await previewBankFile(sql, parsed, "bank.csv");
    expect(preview.rowsNew).toBe(EXPECTED.newPayments);
    expect(preview.rowsIgnored).toBe(EXPECTED.autoIgnored);
    expect(preview.rowsDuplicate).toBe(EXPECTED.duplicatesInFile);
    const reasons = preview.rows
      .filter((r) => r.disposition === "ignored")
      .map((r) => r.ignoredReason);
    expect(reasons).toContain("החזר מרשות המסים");
    expect(reasons).toContain("העברה בין חשבונות של העסק");

    const [{ count }] = await sql`
      select count(*)::int as count from bank_transactions
    `;
    expect(count).toBe(0);
  });

  it("קליטה ראשונה: נכתבות חדשות ומוחרגות, נוצרת רשומת אצווה", async () => {
    const parsed = parseBankCsv(buildBankCsvCp1255());
    const report = await commitBankFile(sql, parsed, {
      actor: "test",
      fileName: "bank.csv",
    });
    expect(report.rowsNew).toBe(EXPECTED.newPayments);
    expect(report.rowsIgnored).toBe(EXPECTED.autoIgnored);

    const [{ count }] = await sql`
      select count(*)::int as count from bank_transactions
    `;
    expect(count).toBe(EXPECTED.creditRowsUnique);

    const [batch] = await sql`select * from import_batches`;
    expect(batch.rowsNew).toBe(EXPECTED.newPayments);
    expect(batch.rangeFrom).toBeTruthy();
    expect(batch.rangeTo).toBeTruthy();
  });

  it("קליטת אותו קובץ פעמיים: 100% מזוהות כמטופלות, אפס רשומות חדשות (קריטריון קבלה 2)", async () => {
    const parsed = parseBankCsv(buildBankCsvCp1255());
    const report = await commitBankFile(sql, parsed, {
      actor: "test",
      fileName: "bank.csv",
    });
    expect(report.rowsNew).toBe(0);
    expect(report.rowsIgnored).toBe(0);
    expect(report.rowsDuplicate).toBe(
      EXPECTED.creditRowsUnique + EXPECTED.duplicatesInFile
    );

    const [{ count }] = await sql`
      select count(*)::int as count from bank_transactions
    `;
    expect(count).toBe(EXPECTED.creditRowsUnique);
  });

  it("סימון ידני 'לא תשלום לקוח' והחזרה, עם יומן ביקורת", async () => {
    const [txn] = await sql`
      select id from bank_transactions where status = 'new' limit 1
    `;
    const ignored = await setTransactionIgnored(
      sql,
      txn.id as string,
      true,
      "test"
    );
    expect(ignored.status).toBe("ignored");
    expect(ignored.ignoredReason).toContain("ידנית");

    const restored = await setTransactionIgnored(
      sql,
      txn.id as string,
      false,
      "test"
    );
    expect(restored.status).toBe("new");
    expect(restored.ignoredReason).toBeNull();

    const audit = await sql`
      select action from audit_log
      where entity = 'bank_transactions' and entity_id = ${txn.id as string}
      order by id
    `;
    expect(audit.map((a) => a.action)).toEqual([
      "bank_txn_ignore",
      "bank_txn_unignore",
    ]);
  });

  it("הקליטה נרשמת ביומן הביקורת", async () => {
    const entries = await sql`
      select * from audit_log where action = 'bank_import'
    `;
    expect(entries.length).toBe(2);
  });
});
