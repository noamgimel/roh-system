import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Sql } from "postgres";
import { freshTestDb } from "./helpers/testDb";
import { buildFixtureWorkbook } from "./helpers/fixtureWorkbook";
import { parseClientsWorkbook } from "@/lib/clients/excel";
import { importClients } from "@/lib/clients/import";
import { listPending, resolvePending, deletePending } from "@/lib/clients/pending";
import { parseBankTable } from "@/lib/bank/csv";

let sql: Sql;

beforeAll(async () => {
  sql = await freshTestDb();
});

afterAll(async () => {
  await sql.end();
});

describe("שורות ייבוא ממתינות להשלמה", () => {
  it("שורות שנכשלו נשמרות כממתינות ולא נעלמות", async () => {
    const parsed = await parseClientsWorkbook(await buildFixtureWorkbook());
    const report = await importClients(sql, parsed, { actor: "t", fileName: "clients.xlsx" });
    expect(report.failed.length).toBe(3);
    expect(report.pendingSaved).toBe(3);
    const pending = await listPending(sql);
    expect(pending).toHaveLength(3);
    expect(pending.some((p) => p.name === "לקוח בלי מספר")).toBe(true);
  });

  it("ייבוא חוזר של אותו קובץ לא משכפל ממתינים", async () => {
    const parsed = await parseClientsWorkbook(await buildFixtureWorkbook());
    const report = await importClients(sql, parsed, { actor: "t", fileName: "clients.xlsx" });
    expect(report.pendingSaved).toBe(0);
    expect(await listPending(sql)).toHaveLength(3);
  });

  it('השלמה עם ת"ז יוצרת לקוח מכל שדות השורה ומסירה אותה', async () => {
    const pending = await listPending(sql);
    const row = pending.find((p) => p.name === "לקוח בלי מספר")!;
    const created = await resolvePending(sql, row.id, { taxId: "777000034" }, "t");
    expect(created.name).toBe("לקוח בלי מספר");
    expect(created.activity).toBe("הובלות"); // נשמר מהשורה המקורית
    expect(created.taxId).toBe("777000034");
    expect((await listPending(sql)).find((p) => p.id === row.id)).toBeUndefined();

    const audit = await sql`select * from audit_log where action = 'import_pending_resolve'`;
    expect(audit).toHaveLength(1);
  });

  it("ייבוא חוזר אחרי השלמה: השורה לא חוזרת לממתינים (לקוח בשם זה כבר קיים)", async () => {
    const parsed = await parseClientsWorkbook(await buildFixtureWorkbook());
    const report = await importClients(sql, parsed, { actor: "t", fileName: "clients-v2.xlsx" });
    expect(report.skippedByName).toBe(1);
    const pending = await listPending(sql);
    expect(pending.some((p) => p.name === "לקוח בלי מספר")).toBe(false);
  });

  it('השלמה של שורה בלי שם דורשת שם; ת"ז לא תקינה נדחית', async () => {
    const pending = await listPending(sql);
    const noName = pending.find((p) => !p.name)!;
    await expect(resolvePending(sql, noName.id, { taxId: "777000042" }, "t")).rejects.toThrow("חסר שם");
    await expect(
      resolvePending(sql, noName.id, { taxId: "12", name: "מישהו" }, "t")
    ).rejects.toThrow("לא תקין");
    const created = await resolvePending(sql, noName.id, { taxId: "777000042", name: "לקוח שהושלם" }, "t");
    expect(created.name).toBe("לקוח שהושלם");
  });

  it("מחיקת שורה ממתינה", async () => {
    const pending = await listPending(sql);
    const before = pending.length;
    await deletePending(sql, pending[0].id, "t");
    expect(await listPending(sql)).toHaveLength(before - 1);
    await expect(deletePending(sql, pending[0].id, "t")).rejects.toThrow("לא נמצאה");
  });
});

describe('תאריך ערך מתוך "הוראת-קבע (תאריך ערך: dd/mm)"', () => {
  it("מחולץ עם השנה של התנועה", () => {
    const parsed = parseBankTable(
      [
        ["תאריך", "הפעולה", "פרטים", "אסמכתא", "חובה", "זכות", "יתרה"],
        ["05/09/2026", "הוראת-קבע (תאריך ערך: 01/09)", "המבצע: א עבור: ב", "1", "", "500", "1000"],
        ["06/09/2026", "העברה", "המבצע: ג עבור: ד", "2", "", "600", "1600"],
      ],
      "utf-8"
    );
    expect(parsed.rows[0].valueDate).toBe("2026-09-01");
    expect(parsed.rows[1].valueDate).toBeNull();
  });
});
