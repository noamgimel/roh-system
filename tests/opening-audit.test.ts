import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Sql } from "postgres";
import { freshTestDb } from "./helpers/testDb";
import { createClient, updateClient } from "@/lib/clients/repo";
import { listAudit, listAuditEntities } from "@/lib/audit-query";
import { setCutoffDate } from "@/lib/settings";

let sql: Sql;
let clientIds: string[] = [];

async function balanceOf(id: string): Promise<number> {
  const [row] = await sql`select balance from client_balances where id = ${id}`;
  return Number(row?.balance ?? NaN);
}

beforeAll(async () => {
  sql = await freshTestDb();
  clientIds = [];
  // מדמה את יום ההקמה: 30 לקוחות בלי יתרות פתיחה
  for (let i = 1; i <= 30; i++) {
    const c = await createClient(
      sql,
      {
        taxId: String(100000000 + i),
        name: `לקוח מספר ${i}`,
        rate: 500 + i,
      },
      "test"
    );
    clientIds.push(c.id as string);
  }
});

afterAll(async () => {
  await sql.end();
});

describe("הזנת יתרות פתיחה ברצף (יום ההקמה)", () => {
  it("עדכון 30 יתרות ברצף — כל אחת נשמרת, מחושבת ומתועדת", async () => {
    for (let i = 0; i < clientIds.length; i++) {
      await updateClient(
        sql,
        clientIds[i],
        { openingBalance: (i + 1) * 100 },
        "test"
      );
    }
    // כל היתרות נכונות
    for (let i = 0; i < clientIds.length; i++) {
      expect(await balanceOf(clientIds[i])).toBe((i + 1) * 100);
    }
    // כל עדכון תועד עם לפני/אחרי
    const audit = await sql`
      select * from audit_log
      where action = 'client_update'
        and (after_data->>'opening_balance') is not null
    `;
    expect(audit.length).toBe(30);
    expect(Number(audit[0].beforeData.openingBalance)).toBe(0);
  });

  it("יתרת פתיחה שלילית (לקוח בזכות) נשמרת", async () => {
    await updateClient(sql, clientIds[0], { openingBalance: -250 }, "test");
    expect(await balanceOf(clientIds[0])).toBe(-250);
  });

  it("תיקון יתרה קיימת מעדכן את החישוב מיידית", async () => {
    await updateClient(sql, clientIds[1], { openingBalance: 999 }, "test");
    expect(await balanceOf(clientIds[1])).toBe(999);
    await updateClient(sql, clientIds[1], { openingBalance: 200 }, "test");
    expect(await balanceOf(clientIds[1])).toBe(200);
  });
});

describe("מסך יומן הביקורת (קריטריון קבלה 12)", () => {
  it("מציג את הרשומות מהחדשה לישנה", async () => {
    const { rows } = await listAudit(sql, { limit: 10 });
    expect(rows.length).toBe(10);
    const ids = rows.map((r) => Number(r.id));
    expect(ids).toEqual([...ids].sort((a, b) => b - a));
  });

  it("סינון לפי ישות", async () => {
    await setCutoffDate(sql, "2026-08-10", "test"); // רשומת app_settings
    const { rows } = await listAudit(sql, { entity: "app_settings" });
    expect(rows.length).toBe(1);
    expect(rows[0].action).toBe("setting_update");

    const clientsOnly = await listAudit(sql, { entity: "clients", limit: 200 });
    expect(clientsOnly.rows.every((r) => r.entity === "clients")).toBe(true);
  });

  it("סינון לפי טווח תאריכים כולל את שני הקצוות", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const inRange = await listAudit(sql, { from: today, to: today, limit: 5 });
    expect(inRange.rows.length).toBeGreaterThan(0);

    const past = await listAudit(sql, { from: "2020-01-01", to: "2020-12-31" });
    expect(past.rows).toHaveLength(0);

    // תאריך לא תקין — מתעלמים מהמסנן במקום לקרוס
    const bad = await listAudit(sql, { from: "לא-תאריך", limit: 5 });
    expect(bad.rows.length).toBeGreaterThan(0);
  });

  it("עימוד: hasMore נכון והעמודים לא חופפים", async () => {
    const page0 = await listAudit(sql, { limit: 20, offset: 0 });
    expect(page0.hasMore).toBe(true);
    const page1 = await listAudit(sql, { limit: 20, offset: 20 });
    const ids0 = new Set(page0.rows.map((r) => r.id));
    expect(page1.rows.every((r) => !ids0.has(r.id))).toBe(true);
  });

  it("limit חסום ב-200 גם אם ביקשו יותר", async () => {
    const { rows } = await listAudit(sql, { limit: 99999 });
    expect(rows.length).toBeLessThanOrEqual(200);
  });

  it("רשימת הישויות למסנן", async () => {
    const entities = await listAuditEntities(sql);
    expect(entities).toContain("clients");
    expect(entities).toContain("app_settings");
  });

  it("קריטריון 12: כל סוגי הפעולות המהותיות שבוצעו מופיעים ביומן", async () => {
    const actions = await sql`select distinct action from audit_log`;
    const set = new Set(actions.map((a) => a.action as string));
    expect(set.has("client_create")).toBe(true);
    expect(set.has("client_update")).toBe(true);
    expect(set.has("setting_update")).toBe(true);
  });
});
