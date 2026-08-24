import type { Sql } from "postgres";

// קריאת יומן הביקורת למסך (קריטריון קבלה 12) — קריאה בלבד.

export interface AuditFilter {
  entity?: string;
  action?: string;
  from?: string; // YYYY-MM-DD כולל
  to?: string; // YYYY-MM-DD כולל
  limit?: number;
  offset?: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function listAudit(sql: Sql, filter: AuditFilter = {}) {
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  const offset = Math.max(filter.offset ?? 0, 0);
  const from = filter.from && DATE_RE.test(filter.from) ? filter.from : null;
  const to = filter.to && DATE_RE.test(filter.to) ? filter.to : null;

  const rows = await sql`
    select * from audit_log
    where true
      ${filter.entity ? sql`and entity = ${filter.entity}` : sql``}
      ${filter.action ? sql`and action = ${filter.action}` : sql``}
      ${from ? sql`and created_at >= ${from}::date` : sql``}
      ${to ? sql`and created_at < (${to}::date + interval '1 day')` : sql``}
    order by id desc
    limit ${limit + 1} offset ${offset}
  `;
  // שורה אחת מעבר ל-limit רק כדי לדעת אם יש עמוד נוסף
  return {
    rows: rows.slice(0, limit),
    hasMore: rows.length > limit,
  };
}

/** רשימת הישויות הקיימות ביומן — לבניית מסנן. */
export async function listAuditEntities(sql: Sql): Promise<string[]> {
  const rows = await sql`
    select distinct entity from audit_log order by entity
  `;
  return rows.map((r) => r.entity as string);
}
