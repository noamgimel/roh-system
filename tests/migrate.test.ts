import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Sql } from "postgres";
import { freshTestDb } from "./helpers/testDb";
import { migrate } from "@/lib/migrate";

let sql: Sql;

beforeAll(async () => {
  sql = await freshTestDb();
});

afterAll(async () => {
  await sql.end();
});

describe("מיגרציות", () => {
  it("יוצרות את כל הטבלאות והתצוגה", async () => {
    const tables = await sql`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
    `;
    const names = tables.map((t) => t.tableName);
    for (const expected of [
      "clients",
      "payers",
      "payer_clients",
      "charges",
      "import_batches",
      "bank_transactions",
      "documents",
      "credit_notes",
      "audit_log",
      "schema_migrations",
    ]) {
      expect(names).toContain(expected);
    }

    const views = await sql`
      select table_name from information_schema.views
      where table_schema = 'public'
    `;
    expect(views.map((v) => v.tableName)).toContain("client_balances");
  });

  it("ריצה חוזרת אינה מריצה דבר מחדש", async () => {
    const ran = await migrate(sql);
    expect(ran).toEqual([]);
  });

  it("updated_at מתעדכן אוטומטית בעדכון לקוח", async () => {
    const [c] = await sql`
      insert into clients (tax_id, name) values ('000000018', 'בדיקת טריגר')
      returning updated_at
    `;
    await sql`select pg_sleep(0.05)`;
    const [after] = await sql`
      update clients set name = 'בדיקת טריגר 2'
      where tax_id = '000000018' returning updated_at
    `;
    expect(new Date(after.updatedAt).getTime()).toBeGreaterThan(
      new Date(c.updatedAt).getTime()
    );
  });
});
