import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Sql } from "postgres";
import { freshTestDb } from "./helpers/testDb";
import {
  buildFixtureWorkbook,
  EXPECTED_VALID_COUNT,
  EXPECTED_FAILED_COUNT,
} from "./helpers/fixtureWorkbook";
import { parseClientsWorkbook } from "@/lib/clients/excel";
import { importClients, findExistingTaxIds } from "@/lib/clients/import";
import { exportClientsWorkbook } from "@/lib/clients/export";

let sql: Sql;
let fixture: Buffer;

beforeAll(async () => {
  sql = await freshTestDb();
  fixture = await buildFixtureWorkbook();
});

afterAll(async () => {
  await sql.end();
});

describe("פענוח קובץ האקסל", () => {
  it("מזהה את שורת הכותרות גם כשיש שורת כותרת-מסמך מעליה", async () => {
    const parsed = await parseClientsWorkbook(fixture);
    expect(parsed.headerRowNumber).toBe(2);
  });

  it('עמודת "6" נשארת לא ממופה ומדווחת', async () => {
    const parsed = await parseClientsWorkbook(fixture);
    expect(parsed.unmappedHeaders).toContain("6");
  });

  it('שתי עמודות "מקדמות" ממופות לפי סדר: שיעור ואז תדירות', async () => {
    const parsed = await parseClientsWorkbook(fixture);
    const advances = parsed.columns.filter((c) => c.header === "מקדמות");
    expect(advances.map((c) => c.field)).toEqual([
      "advances_rate",
      "advances_frequency",
    ]);
  });

  it("מנרמל ת\"ז: אפס מוביל שאבד באקסל מוחזר בריפוד ל-9 ספרות", async () => {
    const parsed = await parseClientsWorkbook(fixture);
    const first = parsed.rows[0];
    expect(first.data.tax_id).toBe("034567890");
    const short = parsed.rows.find((r) => r.data.name === "משה ותיק");
    expect(short?.data.tax_id).toBe("000054321");
  });

  it("שורות פגומות מדווחות עם סיבה ואינן מפילות את הקובץ", async () => {
    const parsed = await parseClientsWorkbook(fixture);
    const failed = parsed.rows.filter((r) => r.errors.length > 0);
    expect(failed).toHaveLength(EXPECTED_FAILED_COUNT);
    const reasons = failed.flatMap((r) => r.errors).join(" | ");
    expect(reasons).toContain('חסר מספר ת"ז/ח"פ');
    expect(reasons).toContain("כפול בקובץ");
    expect(reasons).toContain("חסר שם לקוח");
  });
});

describe("ייבוא לקוחות ל-DB", () => {
  it("ייבוא ראשון יוצר את כל השורות התקינות", async () => {
    const parsed = await parseClientsWorkbook(fixture);
    const report = await importClients(sql, parsed, {
      actor: "test",
      fileName: "fixture.xlsx",
    });
    expect(report.created).toBe(EXPECTED_VALID_COUNT);
    expect(report.updated).toBe(0);
    expect(report.failed).toHaveLength(EXPECTED_FAILED_COUNT);

    const [{ count }] = await sql`select count(*)::int as count from clients`;
    expect(count).toBe(EXPECTED_VALID_COUNT);
  });

  it("ייבוא חוזר של אותו קובץ לא יוצר כפילויות — רק מעדכן (קריטריון קבלה 1)", async () => {
    const parsed = await parseClientsWorkbook(fixture);
    const report = await importClients(sql, parsed, { actor: "test" });
    expect(report.created).toBe(0);
    expect(report.updated).toBe(EXPECTED_VALID_COUNT);

    const [{ count }] = await sql`select count(*)::int as count from clients`;
    expect(count).toBe(EXPECTED_VALID_COUNT);
  });

  it("סטטוס 'לא פעיל' באקסל מתורגם ל-is_active=false", async () => {
    const [dana] = await sql`
      select is_active from clients where name = 'דנה כהן-לוי'
    `;
    expect(dana.isActive).toBe(false);
  });

  it("הייבוא לא נוגע בשדות שבבעלות המערכת (תעריף, יתרת פתיחה, סוג לקוח)", async () => {
    // מדמים הגדרה ידנית של תעריף במערכת
    await sql`
      update clients set rate = 1200, opening_balance = 500, client_type = 'מזדמן'
      where tax_id = '034567890'
    `;
    const parsed = await parseClientsWorkbook(fixture);
    await importClients(sql, parsed, { actor: "test" });
    const [c] = await sql`
      select rate, opening_balance, client_type from clients
      where tax_id = '034567890'
    `;
    expect(Number(c.rate)).toBe(1200);
    expect(Number(c.openingBalance)).toBe(500);
    expect(c.clientType).toBe("מזדמן");
  });

  it("זיהוי כפילויות: findExistingTaxIds מוצא את מי שכבר במערכת", async () => {
    const parsed = await parseClientsWorkbook(fixture);
    const existing = await findExistingTaxIds(sql, parsed);
    expect(existing.size).toBe(EXPECTED_VALID_COUNT); // כולם כבר יובאו
    expect(existing.has("034567890")).toBe(true);
  });

  it("מצב 'ייבא רק חדשים': קיימים מדולגים ולא נדרסים", async () => {
    // משנים שם של לקוח קיים — ייבוא במצב דילוג לא אמור לדרוס אותו
    await sql`
      update clients set name = 'שם ששונה ידנית' where tax_id = '034567890'
    `;
    const parsed = await parseClientsWorkbook(fixture);
    const report = await importClients(sql, parsed, {
      actor: "test",
      updateExisting: false,
    });
    expect(report.created).toBe(0);
    expect(report.updated).toBe(0);
    expect(report.skippedExisting).toBe(EXPECTED_VALID_COUNT);

    const [c] = await sql`select name from clients where tax_id = '034567890'`;
    expect(c.name).toBe("שם ששונה ידנית"); // לא נדרס

    // מצב עדכון מפורש כן דורס — חוזרים למצב המקורי
    await importClients(sql, parsed, { actor: "test", updateExisting: true });
    const [restored] = await sql`
      select name from clients where tax_id = '034567890'
    `;
    expect(restored.name).toBe("ישראל ישראלי");
  });

  it("דוח הכשלונות כולל את נתוני השורה להשלמה ידנית", async () => {
    const parsed = await parseClientsWorkbook(fixture);
    const report = await importClients(sql, parsed, { actor: "test" });
    const noTaxId = report.failed.find((f) => f.name === "לקוח בלי מספר");
    expect(noTaxId).toBeDefined();
    expect(noTaxId!.data.name).toBe("לקוח בלי מספר");
    expect(noTaxId!.data.activity).toBe("הובלות");
  });

  it("הייבוא נרשם ביומן הביקורת", async () => {
    const entries = await sql`
      select * from audit_log where action = 'clients_import'
    `;
    expect(entries.length).toBeGreaterThanOrEqual(2);
    const last = entries[entries.length - 1];
    expect(last.actor).toBe("test");
    expect(last.afterData.total).toBeDefined();
  });
});

describe("ייצוא חזרה לאקסל", () => {
  it("מייצא את כל הלקוחות עם הכותרות המקוריות", async () => {
    const buffer = await exportClientsWorkbook(sql);
    const parsed = await parseClientsWorkbook(buffer);
    expect(parsed.rows).toHaveLength(EXPECTED_VALID_COUNT);
    expect(parsed.rows.every((r) => r.errors.length === 0)).toBe(true);
    // מעגל מלא: ייצוא → ייבוא מחדש לא משנה דבר
    const report = await importClients(sql, parsed, { actor: "test" });
    expect(report.created).toBe(0);
    expect(report.updated).toBe(EXPECTED_VALID_COUNT);
  });
});
