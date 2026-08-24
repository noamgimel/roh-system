import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Sql } from "postgres";
import { freshTestDb } from "./helpers/testDb";
import {
  createClient,
  updateClient,
  listClients,
  getClient,
} from "@/lib/clients/repo";

let sql: Sql;

beforeAll(async () => {
  sql = await freshTestDb();
});

afterAll(async () => {
  await sql.end();
});

describe("מודל הלקוחות", () => {
  it("יצירת לקוח עם נרמול ת\"ז ורישום ביומן", async () => {
    const c = await createClient(
      sql,
      {
        taxId: "34567890", // 8 ספרות — ירופד
        name: "לקוח ראשון",
        clientType: "קבוע",
        rate: 800,
        openingBalance: 1000,
        phone: "0501112233",
      },
      "test"
    );
    expect(c.taxId).toBe("034567890");

    const audit = await sql`
      select * from audit_log
      where action = 'client_create' and entity_id = ${c.id as string}
    `;
    expect(audit).toHaveLength(1);
  });

  it("ת\"ז כפול נחסם על ידי אילוץ הייחודיות", async () => {
    await expect(
      createClient(sql, { taxId: "034567890", name: "כפיל" }, "test")
    ).rejects.toThrow();
  });

  it("עדכון לקוח שומר לפני/אחרי ביומן", async () => {
    const [c] = await listClients(sql, { search: "לקוח ראשון" });
    const updated = await updateClient(
      sql,
      c.id as string,
      { rate: 950 },
      "test"
    );
    expect(Number(updated!.rate)).toBe(950);

    const audit = await sql`
      select * from audit_log
      where action = 'client_update' and entity_id = ${c.id as string}
    `;
    expect(audit).toHaveLength(1);
    expect(Number(audit[0].beforeData.rate)).toBe(800);
  });

  it("חיפוש וסינון: לפי שם, לפי סוג, לפי סטטוס", async () => {
    await createClient(
      sql,
      { taxId: "515555550", name: "מזדמן אחד", clientType: "מזדמן" },
      "test"
    );
    await createClient(
      sql,
      { taxId: "515555551", name: "לא פעיל", isActive: false },
      "test"
    );

    expect(await listClients(sql, { search: "מזדמן" })).toHaveLength(1);
    expect(await listClients(sql, { clientType: "מזדמן" })).toHaveLength(1);
    expect(await listClients(sql, { isActive: false })).toHaveLength(1);
    expect(await listClients(sql)).toHaveLength(3);
  });
});

describe("תצוגת היתרות", () => {
  it("יתרה = פתיחה + חיובים − תשלומים מאושרים בלבד (קריטריון קבלה 7, סמנטיקת שלב א')", async () => {
    const [c] = await listClients(sql, { search: "לקוח ראשון" });
    const id = c.id as string;

    // שני חיובים
    await sql`
      insert into charges (client_id, charge_date, amount, source, period_key)
      values (${id}, '2026-07-01', 950, 'auto_monthly', '2026-07'),
             (${id}, '2026-08-01', 950, 'auto_monthly', '2026-08')
    `;
    // תשלום מאושר — מוריד; תנועה מותאמת שטרם אושרה — לא מורידה
    const [approved] = await sql`
      insert into bank_transactions (row_hash, txn_date, credit, status, matched_client_id)
      values ('h-approved', '2026-08-05', 950, 'approved', ${id})
      returning id
    `;
    await sql`
      insert into transaction_allocations (bank_transaction_id, client_id, amount)
      values (${approved.id as string}, ${id}, 950)
    `;
    await sql`
      insert into bank_transactions (row_hash, txn_date, credit, status, matched_client_id)
      values ('h-matched-only', '2026-08-06', 950, 'matched', ${id})
    `;

    const client = await getClient(sql, id);
    // 1000 פתיחה + 1900 חיובים − 950 מאושר = 1950
    expect(Number(client!.balance)).toBe(1950);
  });

  it("לקוח לא פעיל אינו מופיע בתצוגת היתרות", async () => {
    const rows = await sql`select * from client_balances`;
    expect(rows.find((r) => r.name === "לא פעיל")).toBeUndefined();
  });

  it("חיוב חודשי כפול נחסם באילוץ הייחודיות (קריטריון קבלה 6)", async () => {
    const [c] = await listClients(sql, { search: "לקוח ראשון" });
    const result = await sql`
      insert into charges (client_id, charge_date, amount, source, period_key)
      values (${c.id as string}, '2026-08-01', 950, 'auto_monthly', '2026-08')
      on conflict do nothing
      returning id
    `;
    expect(result).toHaveLength(0);

    // חיובים ידניים בלי period_key אינם מוגבלים
    const manual = await sql`
      insert into charges (client_id, charge_date, amount, source)
      values (${c.id as string}, '2026-08-10', 100, 'manual'),
             (${c.id as string}, '2026-08-11', 100, 'manual')
      returning id
    `;
    expect(manual).toHaveLength(2);
  });
});
