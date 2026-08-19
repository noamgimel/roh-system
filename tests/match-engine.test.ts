import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Sql } from "postgres";
import { freshTestDb } from "./helpers/testDb";
import { encodeCp1255, FIXTURE_LINES } from "./helpers/fixtureBankCsv";
import { parseBankCsv } from "@/lib/bank/csv";
import { commitBankFile } from "@/lib/bank/import";
import { runMatching, confirmMatch, clearMatch } from "@/lib/match/engine";
import { normalizeName, partialNameMatch } from "@/lib/match/normalize";
import { createClient } from "@/lib/clients/repo";

let sql: Sql;

beforeAll(async () => {
  sql = await freshTestDb();
  // לקוחות התואמים את המשלמים בקובץ הבנק הממוסך
  await createClient(
    sql,
    { taxId: "034567890", name: "ישראל ישראלי", rate: 1500 },
    "test"
  );
  await createClient(
    sql,
    { taxId: "123456782", name: "דנה כהן-לוי" },
    "test"
  );
  await createClient(
    sql,
    {
      taxId: "515555555",
      name: 'בדיקה אחזקות בע"מ',
      openingBalance: 3000,
    },
    "test"
  );
  await createClient(sql, { taxId: "000054321", name: "משה ותיק" }, "test");

  // חיוב פתוח ל"בדיקה אחזקות" בסכום התואם את ההעברה (2000) — לכלל 4
  const [holdings] = await sql`
    select id from clients where tax_id = '515555555'
  `;
  await sql`
    insert into charges (client_id, charge_date, amount, source, period_key)
    values (${holdings.id as string}, '2026-08-01', 2000, 'auto_monthly', '2026-08')
  `;

  const parsed = parseBankCsv(
    encodeCp1255(FIXTURE_LINES.join("\r\n") + "\r\n")
  );
  await commitBankFile(sql, parsed, { actor: "test", fileName: "bank.csv" });
});

afterAll(async () => {
  await sql.end();
});

describe("נרמול שמות", () => {
  it("מסיר תארים, פיסוק ורווחים כפולים", () => {
    expect(normalizeName('בדיקה  אחזקות בע"מ')).toBe("בדיקה אחזקות");
    expect(normalizeName("דנה כהן-לוי")).toBe("דנה כהן לוי");
    expect(normalizeName('עו"ד ישראל ישראלי')).toBe("ישראל ישראלי");
  });

  it('אינו פוגע במילים שמכילות "בעמ"/"עוד"/"רוח" בלי גרשיים', () => {
    expect(normalizeName("רוח הצפון")).toBe("רוח הצפון");
    expect(normalizeName("עוד מעט")).toBe("עוד מעט");
  });

  it("תאימות חלקית: הכלה אחרי נרמול, לא על שמות קצרים", () => {
    expect(partialNameMatch("בדיקה אחזקות", 'בדיקה אחזקות בע"מ')).toBe(false); // זהים אחרי נרמול — זה כלל 3
    expect(partialNameMatch("בדיקה אחזקות והשקעות", "בדיקה אחזקות")).toBe(true);
    expect(partialNameMatch("דן", "דנה")).toBe(false);
  });
});

describe("מנוע ההתאמה — כללים 1-5", () => {
  it("ביום הראשון אין כינויים: שמות תואמים → הצעות לאישור, לא אוטומטי", async () => {
    const report = await runMatching(sql, { actor: "test" });
    expect(report.matchedExact).toBe(0); // טבלת הכינויים ריקה

    // כלל 3: שם מלא תואם → high
    const [israel] = await sql`
      select t.*, c.name from bank_transactions t
      join clients c on c.id = t.matched_client_id
      where t.parsed_payer_name = 'ישראל ישראלי'
    `;
    expect(israel.matchConfidence).toBe("high");
    expect(israel.status).toBe("needs_review");
    expect(israel.name).toBe("ישראל ישראלי");
  });

  it('כלל 3 מכסה גם שם עם תואר: "בדיקה אחזקות" מול "בדיקה אחזקות בע"מ" — או כלל 4 עם חיוב פתוח', async () => {
    const [row] = await sql`
      select t.*, c.name from bank_transactions t
      left join clients c on c.id = t.matched_client_id
      where t.parsed_payer_name = 'בדיקה אחזקות'
    `;
    // "בדיקה אחזקות" מול 'בדיקה אחזקות בע"מ' — זהים אחרי נרמול → כלל 3
    expect(row.matchConfidence).toBe("high");
    expect(row.name).toBe('בדיקה אחזקות בע"מ');
  });

  it("שורה בלי משלם נשארת בתור הידני (כלל 5)", async () => {
    const [cash] = await sql`
      select * from bank_transactions where details = 'הפקדת מזומן בסניף'
    `;
    expect(cash.status).toBe("new");
    expect(cash.matchedClientId).toBeNull();
  });

  it("תנועות מוחרגות אינן מוערכות", async () => {
    const ignored = await sql`
      select * from bank_transactions where status = 'ignored'
    `;
    expect(ignored.length).toBe(2);
    expect(ignored.every((r) => r.matchedClientId === null)).toBe(true);
  });

  it("אישור ידני אחד → הקליטה הבאה מאותו חשבון מזוהה אוטומטית (קריטריון קבלה 4)", async () => {
    const [txn] = await sql`
      select * from bank_transactions where parsed_payer_name = 'ישראל ישראלי'
    `;
    const [client] = await sql`
      select id from clients where name = 'ישראל ישראלי'
    `;
    await confirmMatch(sql, txn.id as string, client.id as string, "test");

    // נלמד כינוי
    const [payer] = await sql`
      select * from payers where bank_key = '12-345-11111'
    `;
    expect(payer).toBeDefined();
    const links = await sql`
      select * from payer_clients where payer_id = ${payer.id as string}
    `;
    expect(links).toHaveLength(1);
    expect(links[0].confirmedAt).toBeTruthy();

    // קליטה חדשה מאותו חשבון — תנועה מחודש אחר
    const newLine =
      '20/08/2026,העברת זה"ב,המבצע: י. ישראלי עבור: ספטמבר 12-345-11111,12-345-67890,900020,20/08/2026,,1500.00,"46,700.00"';
    const parsed = parseBankCsv(
      encodeCp1255([FIXTURE_LINES[1], newLine].join("\r\n") + "\r\n")
    );
    await commitBankFile(sql, parsed, { actor: "test", fileName: "b2.csv" });
    await runMatching(sql, { actor: "test" });

    const [auto] = await sql`
      select * from bank_transactions where reference = '900020'
    `;
    expect(auto.status).toBe("matched");
    expect(auto.matchConfidence).toBe("exact");
    expect(auto.matchedClientId).toBe(client.id);
  });

  it("משלם המקושר לכמה לקוחות מגיע לתור הידני תמיד (קריטריון קבלה 5)", async () => {
    // מקשרים את אותו משלם גם ללקוח שני
    const [payer] = await sql`
      select id from payers where bank_key = '12-345-11111'
    `;
    const [second] = await sql`
      select id from clients where name = 'משה ותיק'
    `;
    await sql`
      insert into payer_clients (payer_id, client_id, confirmed_at)
      values (${payer.id as string}, ${second.id as string}, now())
    `;

    // תנועה נוספת מאותו חשבון
    const line =
      '21/08/2026,העברת זה"ב,המבצע: ישראלי עבור: ניכויים 12-345-11111,12-345-67890,900021,21/08/2026,,700.00,"47,400.00"';
    const parsed = parseBankCsv(
      encodeCp1255([FIXTURE_LINES[1], line].join("\r\n") + "\r\n")
    );
    await commitBankFile(sql, parsed, { actor: "test", fileName: "b3.csv" });
    await runMatching(sql, { actor: "test" });

    const [row] = await sql`
      select * from bank_transactions where reference = '900021'
    `;
    expect(row.status).toBe("needs_review");
    expect(row.matchedClientId).toBeNull();
    expect(row.matchReason).toContain("2 לקוחות");
  });

  it("ביטול התאמה מחזיר לתור ואינו מוחק את הכינוי שנלמד", async () => {
    const [txn] = await sql`
      select * from bank_transactions where reference = '900020'
    `;
    await clearMatch(sql, txn.id as string, "test");
    const [after] = await sql`
      select * from bank_transactions where reference = '900020'
    `;
    expect(after.status).toBe("new");
    expect(after.matchedClientId).toBeNull();

    const links = await sql`select * from payer_clients`;
    expect(links.length).toBeGreaterThanOrEqual(2);
  });

  it("כל פעולות ההתאמה נרשמות ביומן הביקורת", async () => {
    const actions = await sql`
      select distinct action from audit_log
      where action in ('match_run', 'match_confirm', 'match_clear')
    `;
    expect(actions.map((a) => a.action).sort()).toEqual([
      "match_clear",
      "match_confirm",
      "match_run",
    ]);
  });
});
