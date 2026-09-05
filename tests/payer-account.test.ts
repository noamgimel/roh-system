import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Sql } from "postgres";
import { freshTestDb } from "./helpers/testDb";
import { parsePayerDetails, extractPayerAccount } from "@/lib/bank/payerParse";
import { createClient } from "@/lib/clients/repo";
import { runMatching, confirmMatch } from "@/lib/match/engine";

// הממצא מהכיול (אומת מול המקור): שדה "פרטים" של הפועלים נושא
// "מח-ן:<מספר>" — מספר החשבון של המשלם. לא ת"ז, לא מצליב ללקוח,
// אבל יציב לכל משלם ⇒ מפתח למידה.

describe("חילוץ מספר חשבון המשלם משדה הפרטים", () => {
  it('התבנית האמיתית: "המבצע: X מח-ן:123456789 עבור: Y"', () => {
    const p = parsePayerDetails("המבצע: משה כהן מח-ן:123456789 עבור: שכר טרחה אוגוסט");
    expect(p?.payerName).toBe("משה כהן");
    expect(p?.payerAccount).toBe("123456789");
    expect(p?.purpose).toBe("שכר טרחה אוגוסט");
    expect(p?.bankKey).toBeNull();
  });

  it("וריאציות: (מס מח-ן:…) בסוף, מח\"ן, אפסים מוליכים, יחד עם בנק-סניף-חשבון", () => {
    const p1 = parsePayerDetails("המבצע: א עבור: ב (מס מח-ן:000123456");
    expect(p1?.payerAccount).toBe("123456");
    expect(p1?.purpose).toBe("ב");
    expect(parsePayerDetails('המבצע: א מח"ן 55512345 עבור: ב')?.payerAccount).toBe("55512345");
    const both = parsePayerDetails("המבצע: א עבור: ב מח-ן:123456789 12-345-11111");
    expect(both?.payerAccount).toBe("123456789");
    expect(both?.bankKey).toBe("12-345-11111");
  });

  it("9 ספרות עומדות לבד נחשבות מספר חשבון; מפתח בנק-סניף-חשבון ושנים לא", () => {
    expect(extractPayerAccount("עבור: משהו 300000001").account).toBe("300000001");
    expect(extractPayerAccount("עבור: משהו 12-345-678901").account).toBeNull();
    expect(extractPayerAccount("עבור: אוגוסט 2026").account).toBeNull();
  });
});

describe("מנוע ההתאמה — למידה לפי מספר חשבון המשלם", () => {
  let sql: Sql;
  let clientB: string;

  beforeAll(async () => {
    sql = await freshTestDb();
    const b = await createClient(sql, { taxId: "515000002", name: "חברה ב" }, "t");
    clientB = b.id as string;
    await sql`
      insert into bank_transactions (row_hash, txn_date, credit, status, parsed_payer_name, parsed_payer_account)
      values
        ('a1', '2026-08-05', 1000, 'new', 'בעל החברה', '123456789'),
        ('a2', '2026-08-06', 2000, 'new', 'חברה ב', null)
    `;
  });

  afterAll(async () => {
    await sql.end();
  });

  it("ביום הראשון מספר חשבון לא-מוכר ⇒ תור ידני; שם זהה ⇒ הצעה", async () => {
    const report = await runMatching(sql, { actor: "t" });
    expect(report.matchedExact).toBe(0);
    const [a1] = await sql`select * from bank_transactions where row_hash = 'a1'`;
    expect(a1.status).toBe("new");
    const [a2] = await sql`select * from bank_transactions where row_hash = 'a2'`;
    expect(a2.matchConfidence).toBe("high");
    expect(a2.matchedClientId).toBe(clientB);
  });

  it("אישור ידני לומד את מספר החשבון — הפעם הבאה ודאית גם בשם אחר", async () => {
    const [a1] = await sql`select id from bank_transactions where row_hash = 'a1'`;
    await confirmMatch(sql, a1.id as string, clientB, "t");
    const [payer] = await sql`select * from payers where account_no = '123456789'`;
    expect(payer).toBeDefined();

    await sql`
      insert into bank_transactions (row_hash, txn_date, credit, status, parsed_payer_name, parsed_payer_account)
      values ('a3', '2026-09-05', 1000, 'new', 'כתיב אחר לגמרי', '123456789')
    `;
    const report = await runMatching(sql, { actor: "t" });
    expect(report.matchedExact).toBe(1);
    const [a3] = await sql`select * from bank_transactions where row_hash = 'a3'`;
    expect(a3.status).toBe("matched");
    expect(a3.matchedClientId).toBe(clientB);
    expect(a3.matchReason).toContain("מח-ן");
  });

  it("אותו משלם שנלמד גם לפי bank_key — משלימים למשלם קיים במקום לשכפל", async () => {
    await sql`
      insert into bank_transactions (row_hash, txn_date, credit, status, parsed_payer_name, parsed_payer_account, parsed_bank_key)
      values ('a4', '2026-09-06', 1000, 'new', 'בעל החברה', '123456789', '10-800-55555')
    `;
    const [a4] = await sql`select id from bank_transactions where row_hash = 'a4'`;
    await confirmMatch(sql, a4.id as string, clientB, "t");
    const payers = await sql`select * from payers`;
    expect(payers).toHaveLength(1);
    expect(payers[0].bankKey).toBe("10-800-55555");
    expect(payers[0].accountNo).toBe("123456789");
  });
});
