import type { Sql } from "postgres";
import { writeAudit } from "@/lib/audit";

// מנוע החיובים (סעיף 8 באפיון):
// - חיוב חודשי אוטומטי ללקוח קבוע פעיל עם תעריף, ב-1 לחודש.
//   האילוץ הייחודי (client_id, source, period_key) מבטיח חיוב אחד
//   לכל לקוח לכל חודש גם בהרצה כפולה (קריטריון קבלה 6).
// - חיוב חד-פעמי ידני — נוצר מכרטיס הלקוח כשמסופק שירות.

export interface MonthlyChargesReport {
  period: string; // YYYY-MM
  eligible: number;
  created: number;
  skippedExisting: number;
}

/** 'YYYY-MM' של החודש הנוכחי */
export function currentPeriod(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * הרצת החיוב החודשי לתקופה נתונה. אידמפוטנטית — הרצה חוזרת לא
 * יוצרת דבר. מיועדת להיקרא ממשימת n8n ב-1 לחודש, וגם ידנית מהמסך.
 */
export async function runMonthlyCharges(
  sql: Sql,
  opts: { period?: string; actor: string }
): Promise<MonthlyChargesReport> {
  const period = opts.period ?? currentPeriod();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    throw new Error(`תקופה לא תקינה: "${period}" — הפורמט הוא YYYY-MM`);
  }
  const chargeDate = `${period}-01`;

  return sql.begin(async (tx) => {
    const eligible = await tx`
      select id, rate from clients
      where is_active and client_type = 'קבוע' and rate is not null
    `;

    const created = await tx`
      insert into charges (client_id, charge_date, amount, description, source, period_key)
      select id, ${chargeDate}::date, rate, ${"חיוב חודשי " + period}, 'auto_monthly', ${period}
      from clients
      where is_active and client_type = 'קבוע' and rate is not null
      on conflict (client_id, source, period_key) do nothing
      returning id
    `;

    const report: MonthlyChargesReport = {
      period,
      eligible: eligible.length,
      created: created.length,
      skippedExisting: eligible.length - created.length,
    };

    await writeAudit(tx, {
      actor: opts.actor,
      action: "monthly_charges_run",
      entity: "charges",
      after: report as unknown as Record<string, unknown>,
    });
    return report;
  });
}

/** חיוב חד-פעמי ידני מכרטיס הלקוח. */
export async function createManualCharge(
  sql: Sql,
  input: {
    clientId: string;
    amount: number;
    chargeDate: string; // YYYY-MM-DD
    description?: string | null;
  },
  actor: string
) {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("סכום החיוב חייב להיות מספר חיובי");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.chargeDate)) {
    throw new Error("תאריך חיוב לא תקין");
  }
  return sql.begin(async (tx) => {
    const [client] = await tx`
      select id, name from clients where id = ${input.clientId}
    `;
    if (!client) throw new Error("לקוח לא נמצא");

    const [charge] = await tx`
      insert into charges (client_id, charge_date, amount, description, source)
      values (${input.clientId}, ${input.chargeDate}, ${input.amount},
              ${input.description ?? null}, 'manual')
      returning *
    `;
    await writeAudit(tx, {
      actor,
      action: "charge_create_manual",
      entity: "charges",
      entityId: charge.id as string,
      after: {
        client_id: input.clientId,
        client_name: client.name,
        amount: input.amount,
        charge_date: input.chargeDate,
        description: input.description ?? null,
      },
    });
    return charge;
  });
}

export interface BalanceRow {
  id: string;
  name: string;
  clientType: string;
  openingBalance: string;
  chargesTotal: string;
  issuedTotal: string;
  balance: string;
  paidNotIssued: string; // הותאם אך טרם הונפק מסמך — מוצג בנפרד
}

/**
 * מסך היתרות: היתרה המחושבת לכל לקוח פעיל, וסימון נפרד של
 * "שולם, טרם הונפק" — תנועות שהותאמו ללקוח אך עוד לא הונפק להן
 * מסמך. הן אינן מורידות את היתרה (רק מסמך issued מוריד), אבל
 * מוצגות כדי שהמסך לא ישקר וגם לא יבלבל.
 */
export async function getBalancesOverview(sql: Sql): Promise<BalanceRow[]> {
  const rows = await sql`
    select
      c.id, c.name, c.client_type, c.opening_balance,
      coalesce((select sum(amount) from charges where client_id = c.id), 0)
        as charges_total,
      coalesce((select sum(amount) from documents
                where client_id = c.id and status = 'issued'), 0)
        as issued_total,
      b.balance,
      coalesce((select sum(t.credit) from bank_transactions t
                where t.matched_client_id = c.id
                  and t.status in ('matched', 'approved')), 0)
        as paid_not_issued
    from clients c
    join client_balances b on b.id = c.id
    where c.is_active
    order by b.balance desc, c.name
  `;
  return rows as unknown as BalanceRow[];
}
