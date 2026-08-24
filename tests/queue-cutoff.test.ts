import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Sql } from "postgres";
import { freshTestDb } from "./helpers/testDb";
import { createClient } from "@/lib/clients/repo";
import { setCutoffDate, getCutoffDate } from "@/lib/settings";
import { CUTOFF_IGNORE_REASON, previewBankFile, commitBankFile } from "@/lib/bank/import";
import { parseBankCsv } from "@/lib/bank/csv";
import { encodeCp1255, FIXTURE_LINES } from "./helpers/fixtureBankCsv";
import {
  approveTransaction,
  approveAllMatched,
  splitTransaction,
  unapproveTransaction,
} from "@/lib/match/queue";
import { runMatching, confirmMatch } from "@/lib/match/engine";
import { getBalancesOverview } from "@/lib/charges/engine";

let sql: Sql;
let clientA: string; // ישראל ישראלי — יתרת פתיחה 2000
let clientB: string; // דנה כהן-לוי — יתרת פתיחה 1000

async function balanceOf(id: string): Promise<number> {
  const [row] = await sql`select balance from client_balances where id = ${id}`;
  return Number(row?.balance ?? NaN);
}

beforeAll(async () => {
  sql = await freshTestDb();
  const a = await createClient(
    sql,
    { taxId: "034567890", name: "ישראל ישראלי", openingBalance: 2000 },
    "test"
  );
  clientA = a.id as string;
  const b = await createClient(
    sql,
    { taxId: "123456782", name: "דנה כהן-לוי", openingBalance: 1000 },
    "test"
  );
  clientB = b.id as string;
});

afterAll(async () => {
  await sql.end();
});

describe("תאריך חתך", () => {
  it("קביעה, קריאה, ולידציה ורישום ביומן", async () => {
    await expect(setCutoffDate(sql, "10/08/2026", "test")).rejects.toThrow(
      "לא תקין"
    );
    await setCutoffDate(sql, "2026-08-10", "test");
    expect(await getCutoffDate(sql)).toBe("2026-08-10");

    const audit = await sql`
      select * from audit_log where action = 'setting_update'
    `;
    expect(audit).toHaveLength(1);
    expect(audit[0].afterData.value).toBe("2026-08-10");
  });

  it("בקליטה: שורה עד תאריך החתך (כולל) מוחרגת אוטומטית עם נימוק", async () => {
    // הפיקסטורה: תנועות 05/08–15/08. חתך 10/08 ⇒ 05,06,07 מוחרגות
    const parsed = parseBankCsv(
      encodeCp1255(FIXTURE_LINES.join("\r\n") + "\r\n")
    );
    const preview = await previewBankFile(sql, parsed, "bank.csv");
    const cutoffIgnored = preview.rows.filter(
      (r) => r.ignoredReason === CUTOFF_IGNORE_REASON
    );
    expect(cutoffIgnored.map((r) => r.txnDate).sort()).toEqual([
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
    ]);
    // ואחרי הקליטה — נשמרות בסטטוס ignored
    await commitBankFile(sql, parsed, { actor: "test", fileName: "bank.csv" });
    const ignored = await sql`
      select count(*)::int as count from bank_transactions
      where ignored_reason = ${CUTOFF_IGNORE_REASON}
    `;
    expect(ignored[0].count).toBe(3);
  });
});

describe("אישור תשלום ורישום מול היתרה", () => {
  it("תנועה מותאמת שאושרה מורידה את היתרה; לפני האישור — לא", async () => {
    await runMatching(sql, { actor: "test" });
    // ישראל ישראלי הותאם בשם (high) → needs_review; מאשרים שיוך
    const [txn] = await sql`
      select * from bank_transactions where parsed_payer_name = 'ישראל ישראלי'
    `;
    expect(await balanceOf(clientA)).toBe(2000); // עוד לא אושר דבר

    await confirmMatch(sql, txn.id as string, clientA, "test");
    expect(await balanceOf(clientA)).toBe(2000); // matched עדיין לא נרשם

    await approveTransaction(sql, txn.id as string, "test");
    expect(await balanceOf(clientA)).toBe(500); // 2000 − 1500

    const audit = await sql`
      select * from audit_log where action = 'payment_approve'
    `;
    expect(audit).toHaveLength(1);
  });

  it("אי אפשר לאשר תנועה בלי שיוך או שאינה בתור", async () => {
    const [unmatched] = await sql`
      insert into bank_transactions (row_hash, txn_date, credit, status)
      values ('h-no-client', '2026-08-22', 123, 'new')
      returning id
    `;
    await expect(
      approveTransaction(sql, unmatched.id as string, "test")
    ).rejects.toThrow();
    // תנועה matched בלי לקוח משויך — גם נדחית
    await sql`
      update bank_transactions set status = 'matched' where id = ${unmatched.id as string}
    `;
    await expect(
      approveTransaction(sql, unmatched.id as string, "test")
    ).rejects.toThrow("בלי לקוח משויך");
    await sql`
      delete from bank_transactions where id = ${unmatched.id as string}
    `;
  });

  it("ביטול אישור מוחק את השיוך ומחזיר את היתרה", async () => {
    const [txn] = await sql`
      select id from bank_transactions where status = 'approved'
    `;
    await unapproveTransaction(sql, txn.id as string, "test");
    expect(await balanceOf(clientA)).toBe(2000);
    const [restored] = await sql`
      select status from bank_transactions where id = ${txn.id as string}
    `;
    expect(restored.status).toBe("matched");

    // מאשרים חזרה להמשך הבדיקות
    await approveTransaction(sql, txn.id as string, "test");
    expect(await balanceOf(clientA)).toBe(500);
  });

  it("תשלום חלקי: היתרה נשארת פתוחה ומוצגת ככזו", async () => {
    // דנה שילמה 950 מול יתרה 1000 — נשאר 50 פתוח
    const [txn] = await sql`
      select id from bank_transactions
      where parsed_payer_name = 'דנה כהן-לוי' and status != 'ignored'
      order by created_at limit 1
    `;
    await confirmMatch(sql, txn.id as string, clientB, "test");
    await approveTransaction(sql, txn.id as string, "test");
    expect(await balanceOf(clientB)).toBe(50);

    const overview = await getBalancesOverview(sql);
    const dana = overview.find((r) => r.id === clientB)!;
    expect(Number(dana.balance)).toBe(50);
    expect(Number(dana.paidTotal)).toBe(950);
  });

  it("אישור תנועה שקודמת לתאריך החתך נחסם עם הסבר", async () => {
    const [old] = await sql`
      insert into bank_transactions (row_hash, txn_date, credit, status, matched_client_id)
      values ('h-pre-cutoff', '2026-08-01', 200, 'matched', ${clientA})
      returning id
    `;
    await expect(
      approveTransaction(sql, old.id as string, "test")
    ).rejects.toThrow("קודמת לתאריך החתך");
    // ואישור מרוכז מדלג עליה בלי להיכשל
    const bulk = await approveAllMatched(sql, "test");
    const [still] = await sql`
      select status from bank_transactions where id = ${old.id as string}
    `;
    expect(still.status).toBe("matched");
    expect(bulk).toBeDefined();
    await sql`delete from bank_transactions where id = ${old.id as string}`;
  });

  it("תנועות שאושרו לפני תאריך החתך אינן נספרות ביתרה", async () => {
    // מזיזים את החתך קדימה כך שיכסה את התשלום של דנה (11/08)
    await setCutoffDate(sql, "2026-08-12", "test");
    expect(await balanceOf(clientB)).toBe(1000); // התשלום מ-11/08 לא נספר
    await setCutoffDate(sql, "2026-08-10", "test"); // החזרה
    expect(await balanceOf(clientB)).toBe(50);
  });
});

describe("פיצול תשלום מרוכז", () => {
  it("סכום החלקים חייב להיות שווה בדיוק לסכום התנועה", async () => {
    const [txn] = await sql`
      select id from bank_transactions
      where parsed_payer_name = 'דנה כהן-לוי' and status in ('new','needs_review','matched')
      limit 1
    `;
    await expect(
      splitTransaction(
        sql,
        txn.id as string,
        [
          { clientId: clientA, amount: 500 },
          { clientId: clientB, amount: 400 },
        ],
        "test"
      )
    ).rejects.toThrow("שווה לסכום התנועה");
  });

  it("פיצול תקין רושם לשני הלקוחות ומאשר את התנועה", async () => {
    const [txn] = await sql`
      select id, credit from bank_transactions
      where parsed_payer_name = 'דנה כהן-לוי' and status in ('new','needs_review','matched')
      limit 1
    `;
    const before = {
      a: await balanceOf(clientA),
      b: await balanceOf(clientB),
    };
    // 950 = 600 לישראל + 350 לדנה
    await splitTransaction(
      sql,
      txn.id as string,
      [
        { clientId: clientA, amount: 600 },
        { clientId: clientB, amount: 350 },
      ],
      "test"
    );
    expect(await balanceOf(clientA)).toBe(before.a - 600);
    expect(await balanceOf(clientB)).toBe(before.b - 350);

    const [updated] = await sql`
      select status from bank_transactions where id = ${txn.id as string}
    `;
    expect(updated.status).toBe("approved");

    const audit = await sql`
      select * from audit_log where action = 'payment_split'
    `;
    expect(audit).toHaveLength(1);
    expect(audit[0].afterData.parts).toHaveLength(2);
  });

  it("פיצול עם חלק אחד או לקוח כפול נדחה", async () => {
    const [txn] = await sql`
      insert into bank_transactions (row_hash, txn_date, credit, status)
      values ('h-split-validation', '2026-08-22', 2, 'new')
      returning id
    `;
    await expect(
      splitTransaction(sql, txn.id as string, [{ clientId: clientA, amount: 1 }], "test")
    ).rejects.toThrow("שני חלקים");
    await expect(
      splitTransaction(
        sql,
        txn.id as string,
        [
          { clientId: clientA, amount: 1 },
          { clientId: clientA, amount: 1 },
        ],
        "test"
      )
    ).rejects.toThrow("פעמיים");
  });
});

describe("אישור מרוכז ותצוגת התור", () => {
  it("אשר-הכול מאשר את כל המותאמות בלבד", async () => {
    // משה ותיק הותאם בשם (high, needs_review) — נאשר את השיוך; החתך 10/08 מחריג את תנועתו (07/08)?
    // תנועת משה מ-07/08 הוחרגה בחתך, לכן ניצור תנועה מותאמת חדשה ידנית
    const [moshe] = await sql`
      insert into bank_transactions (row_hash, txn_date, credit, status, matched_client_id, match_confidence)
      values ('h-manual-matched', '2026-08-20', 300, 'matched', ${clientA}, 'exact')
      returning id
    `;
    const result = await approveAllMatched(sql, "test");
    expect(result.approved).toBeGreaterThanOrEqual(1);
    const [after] = await sql`
      select status from bank_transactions where id = ${moshe.id as string}
    `;
    expect(after.status).toBe("approved");

    const remaining = await sql`
      select count(*)::int as count from bank_transactions where status = 'matched'
    `;
    expect(remaining[0].count).toBe(0);
  });

  it('סקירת היתרות: "ממתין לאישור" סופר רק תנועות מותאמות', async () => {
    await sql`
      insert into bank_transactions (row_hash, txn_date, credit, status, matched_client_id, match_confidence)
      values ('h-pending-1', '2026-08-21', 700, 'matched', ${clientB}, 'exact')
    `;
    const overview = await getBalancesOverview(sql);
    const dana = overview.find((r) => r.id === clientB)!;
    expect(Number(dana.pendingApproval)).toBe(700);
  });
});
