import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Sql } from "postgres";
import { freshTestDb } from "./helpers/testDb";
import {
  runMonthlyCharges,
  createManualCharge,
  getBalancesOverview,
  currentPeriod,
} from "@/lib/charges/engine";
import { createClient } from "@/lib/clients/repo";

let sql: Sql;
let fixedId: string;
let casualId: string;

beforeAll(async () => {
  sql = await freshTestDb();
  const fixed = await createClient(
    sql,
    { taxId: "034567890", name: "קבוע עם תעריף", rate: 800, openingBalance: 1000 },
    "test"
  );
  fixedId = fixed.id as string;
  const casual = await createClient(
    sql,
    { taxId: "123456782", name: "מזדמן", clientType: "מזדמן" },
    "test"
  );
  casualId = casual.id as string;
  // קבוע בלי תעריף — לא זכאי לחיוב אוטומטי
  await createClient(sql, { taxId: "515555555", name: "קבוע בלי תעריף" }, "test");
  // קבוע לא פעיל — לא זכאי
  await createClient(
    sql,
    { taxId: "999888777", name: "קבוע לא פעיל", rate: 500, isActive: false },
    "test"
  );
});

afterAll(async () => {
  await sql.end();
});

describe("חיוב חודשי אוטומטי", () => {
  it("מחייב רק לקוח קבוע פעיל עם תעריף", async () => {
    const report = await runMonthlyCharges(sql, {
      period: "2026-08",
      actor: "test",
    });
    expect(report.eligible).toBe(1);
    expect(report.created).toBe(1);

    const charges = await sql`select * from charges`;
    expect(charges).toHaveLength(1);
    expect(charges[0].clientId).toBe(fixedId);
    expect(Number(charges[0].amount)).toBe(800);
    expect(charges[0].periodKey).toBe("2026-08");
    expect(charges[0].source).toBe("auto_monthly");
  });

  it("הרצה כפולה לאותו חודש לא יוצרת דבר (קריטריון קבלה 6)", async () => {
    const report = await runMonthlyCharges(sql, {
      period: "2026-08",
      actor: "test",
    });
    expect(report.created).toBe(0);
    expect(report.skippedExisting).toBe(1);
    const [{ count }] = await sql`select count(*)::int as count from charges`;
    expect(count).toBe(1);
  });

  it("חודש חדש יוצר חיוב חדש", async () => {
    const report = await runMonthlyCharges(sql, {
      period: "2026-09",
      actor: "test",
    });
    expect(report.created).toBe(1);
  });

  it("תקופה לא תקינה נדחית", async () => {
    await expect(
      runMonthlyCharges(sql, { period: "08-2026", actor: "test" })
    ).rejects.toThrow("תקופה לא תקינה");
  });

  it("currentPeriod מחזיר YYYY-MM", () => {
    expect(currentPeriod(new Date("2026-03-05"))).toBe("2026-03");
    expect(currentPeriod(new Date("2026-11-20"))).toBe("2026-11");
  });

  it("ההרצה נרשמת ביומן הביקורת", async () => {
    const entries = await sql`
      select * from audit_log where action = 'monthly_charges_run'
    `;
    expect(entries.length).toBe(3);
  });
});

describe("חיוב ידני", () => {
  it("יוצר חיוב חד-פעמי ללקוח מזדמן עם רישום ביומן", async () => {
    const charge = await createManualCharge(
      sql,
      {
        clientId: casualId,
        amount: 350,
        chargeDate: "2026-08-10",
        description: "דוח שנתי",
      },
      "test"
    );
    expect(charge.source).toBe("manual");
    expect(charge.periodKey).toBeNull();

    const audit = await sql`
      select * from audit_log where action = 'charge_create_manual'
    `;
    expect(audit).toHaveLength(1);
  });

  it("סכום שלילי או אפס נדחה", async () => {
    await expect(
      createManualCharge(
        sql,
        { clientId: casualId, amount: 0, chargeDate: "2026-08-10" },
        "test"
      )
    ).rejects.toThrow("חיובי");
  });

  it("שני חיובים ידניים באותו יום מותרים (אין period_key)", async () => {
    await createManualCharge(
      sql,
      { clientId: casualId, amount: 100, chargeDate: "2026-08-10" },
      "test"
    );
    const charges = await sql`
      select * from charges where client_id = ${casualId}
    `;
    expect(charges).toHaveLength(2); // 350 + 100, האפס נדחה
  });
});

describe("מסך היתרות", () => {
  it('היתרה ו"שולם טרם הונפק" מחושבים נכון (קריטריון קבלה 7)', async () => {
    // תנועה מותאמת שטרם הונפקה + מסמך שהונפק
    await sql`
      insert into bank_transactions
        (row_hash, txn_date, credit, status, matched_client_id)
      values
        ('h-pending', '2026-08-05', 800, 'matched', ${fixedId}),
        ('h-new-unmatched', '2026-08-06', 500, 'new', null)
    `;
    await sql`
      insert into documents (client_id, amount, payment_date, idempotency_key, status, provider)
      values (${fixedId}, 800, '2026-07-05', 'k1', 'issued', 'paperless'),
             (${fixedId}, 999, '2026-07-06', 'k2', 'draft', 'paperless')
    `;

    const rows = await getBalancesOverview(sql);
    const fixed = rows.find((r) => r.id === fixedId)!;
    // 1000 פתיחה + 1600 חיובים (אוג+ספט) − 800 הונפק = 1800
    expect(Number(fixed.balance)).toBe(1800);
    expect(Number(fixed.chargesTotal)).toBe(1600);
    expect(Number(fixed.issuedTotal)).toBe(800);
    expect(Number(fixed.paidNotIssued)).toBe(800);

    const casual = rows.find((r) => r.id === casualId)!;
    expect(Number(casual.balance)).toBe(450);
    expect(Number(casual.paidNotIssued)).toBe(0);
  });

  it("לקוח לא פעיל אינו מופיע במסך היתרות", async () => {
    const rows = await getBalancesOverview(sql);
    expect(rows.find((r) => r.name === "קבוע לא פעיל")).toBeUndefined();
    expect(rows).toHaveLength(3);
  });
});
