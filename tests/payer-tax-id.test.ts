import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Sql } from "postgres";
import { freshTestDb } from "./helpers/testDb";
import { parsePayerDetails, extractTaxId } from "@/lib/bank/payerParse";
import { createClient } from "@/lib/clients/repo";
import { runMatching, confirmMatch } from "@/lib/match/engine";

// הממצא המרכזי של הכיול: שדה "פרטים" של הפועלים נושא את ת"ז המשלם —
// המפתח החזק ביותר להתאמה, חזק מחשבון בנק ומשם.

describe("חילוץ ת\"ז המשלם משדה הפרטים", () => {
  it('התבנית האמיתית: "המבצע: X עבור: Y (מס ת-ז:012345675"', () => {
    const p = parsePayerDetails("המבצע: משה כהן עבור: שכר טרחה אוגוסט (מס ת-ז:012345675");
    expect(p?.payerName).toBe("משה כהן");
    expect(p?.payerTaxId).toBe("012345675");
    expect(p?.purpose).toBe("שכר טרחה אוגוסט"); // הת"ז והסוגר הוסרו מהמטרה
    expect(p?.bankKey).toBeNull();
  });

  it("וריאציות: ת.ז / ת\"ז / ח.פ / 8 ספרות מרופדות / ת\"ז + חשבון יחד", () => {
    expect(parsePayerDetails("המבצע: א עבור: ב ת.ז 12345678")?.payerTaxId).toBe("012345678");
    expect(parsePayerDetails('המבצע: א עבור: ב ת"ז:300000001')?.payerTaxId).toBe("300000001");
    expect(parsePayerDetails("המבצע: חברה עבור: ב ח.פ 515000002")?.payerTaxId).toBe("515000002");
    const both = parsePayerDetails("המבצע: א עבור: ב (מס ת-ז:012345675 12-345-11111");
    expect(both?.payerTaxId).toBe("012345675");
    expect(both?.bankKey).toBe("12-345-11111");
  });

  it("9 ספרות עומדות לבד נחשבות ת\"ז; מפתח חשבון לא מתבלבל", () => {
    expect(extractTaxId("עבור: משהו 300000001").taxId).toBe("300000001");
    expect(extractTaxId("עבור: משהו 12-345-678901").taxId).toBeNull();
    expect(extractTaxId("עבור: אוגוסט 2026").taxId).toBeNull();
  });
});

describe("מנוע ההתאמה — כלל ת\"ז", () => {
  let sql: Sql;
  let clientA: string;
  let clientB: string;

  beforeAll(async () => {
    sql = await freshTestDb();
    const a = await createClient(sql, { taxId: "012345675", name: "לקוח א", spouseTaxId: "300000001" }, "t");
    const b = await createClient(sql, { taxId: "515000002", name: "חברה ב" }, "t");
    clientA = a.id as string;
    clientB = b.id as string;
    await sql`
      insert into bank_transactions (row_hash, txn_date, credit, status, parsed_payer_name, parsed_payer_tax_id)
      values
        ('t1', '2026-08-05', 1000, 'new', 'שם אחר לגמרי', '012345675'),
        ('t2', '2026-08-06', 2000, 'new', 'בן הזוג', '300000001'),
        ('t3', '2026-08-07', 3000, 'new', 'לא מוכר', '999999998'),
        ('t4', '2026-08-08', 4000, 'new', 'חברה ב', null)
    `;
  });

  afterAll(async () => {
    await sql.end();
  });

  it('ת"ז המשלם = ת"ז לקוח ⇒ ודאי ואוטומטי, גם אם השם שונה לגמרי', async () => {
    const report = await runMatching(sql, { actor: "t" });
    expect(report.matchedExact).toBe(1);
    const [t1] = await sql`select * from bank_transactions where row_hash = 't1'`;
    expect(t1.status).toBe("matched");
    expect(t1.matchedClientId).toBe(clientA);
    expect(t1.matchReason).toContain('ת"ז');
  });

  it('ת"ז המשלם = ת"ז בן/בת זוג ⇒ הצעה בביטחון גבוה, לא אוטומטי', async () => {
    const [t2] = await sql`select * from bank_transactions where row_hash = 't2'`;
    expect(t2.status).toBe("needs_review");
    expect(t2.matchConfidence).toBe("high");
    expect(t2.matchedClientId).toBe(clientA);
  });

  it('ת"ז לא מוכרת ⇒ תור ידני; שם תואם בלי ת"ז ⇒ הצעה לפי שם', async () => {
    const [t3] = await sql`select * from bank_transactions where row_hash = 't3'`;
    expect(t3.status).toBe("new");
    const [t4] = await sql`select * from bank_transactions where row_hash = 't4'`;
    expect(t4.matchConfidence).toBe("high");
    expect(t4.matchedClientId).toBe(clientB);
  });

  it('אישור ידני לומד גם לפי ת"ז — הפעם הבאה מאותה ת"ז ודאית', async () => {
    const [t3] = await sql`select id from bank_transactions where row_hash = 't3'`;
    await confirmMatch(sql, t3.id as string, clientB, "t");
    const [payer] = await sql`select * from payers where tax_id = '999999998'`;
    expect(payer).toBeDefined();

    await sql`
      insert into bank_transactions (row_hash, txn_date, credit, status, parsed_payer_name, parsed_payer_tax_id)
      values ('t5', '2026-09-07', 3000, 'new', 'כתיב אחר', '999999998')
    `;
    await runMatching(sql, { actor: "t" });
    const [t5] = await sql`select * from bank_transactions where row_hash = 't5'`;
    expect(t5.status).toBe("matched");
    expect(t5.matchedClientId).toBe(clientB);
  });
});
