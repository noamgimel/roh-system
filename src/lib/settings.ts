import type { Sql } from "postgres";
import { writeAudit } from "@/lib/audit";

// הגדרות מערכת — ערכי מפתח/ערך עם תיעוד שינויים ביומן הביקורת.

export const CUTOFF_KEY = "balance_cutoff_date";

export async function getSetting(sql: Sql, key: string): Promise<string | null> {
  const rows = await sql`select value from app_settings where key = ${key}`;
  const v = rows[0]?.value as string | undefined;
  return v ? v : null;
}

async function setSetting(
  sql: Sql,
  key: string,
  value: string | null,
  actor: string
) {
  await sql.begin(async (tx) => {
    const before = await tx`select value from app_settings where key = ${key}`;
    await tx`
      insert into app_settings (key, value, updated_at)
      values (${key}, ${value}, now())
      on conflict (key) do update set value = ${value}, updated_at = now()
    `;
    await writeAudit(tx, {
      actor,
      action: "setting_update",
      entity: "app_settings",
      entityId: key,
      before: { value: (before[0]?.value as string) ?? null },
      after: { value },
    });
  });
}

/**
 * תאריך החתך ליתרות הפתיחה: היתרות הידניות נכונות לתאריך הזה,
 * ורק תנועות מאוחרות ממנו משפיעות על היתרה. בלעדיו — תשלום שכבר
 * גולם ביתרת הפתיחה יוריד את היתרה פעם שנייה.
 */
export async function getCutoffDate(sql: Sql): Promise<string | null> {
  return getSetting(sql, CUTOFF_KEY);
}

export async function setCutoffDate(
  sql: Sql,
  date: string | null,
  actor: string
) {
  if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("תאריך חתך לא תקין — הפורמט הוא YYYY-MM-DD");
  }
  await setSetting(sql, CUTOFF_KEY, date, actor);
}
