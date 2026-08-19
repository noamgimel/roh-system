import type { Sql, TransactionSql } from "postgres";

export interface AuditEntry {
  actor: string;
  action: string;
  entity: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
}

/** כתיבת רשומת יומן ביקורת. כלל ברזל 10 — כל פעולה מהותית מתועדת. */
export async function writeAudit(sql: Sql | TransactionSql, e: AuditEntry) {
  await sql`
    insert into audit_log (actor, action, entity, entity_id, before_data, after_data, ip)
    values (
      ${e.actor},
      ${e.action},
      ${e.entity},
      ${e.entityId ?? null},
      ${e.before === undefined ? null : sql.json(e.before as never)},
      ${e.after === undefined ? null : sql.json(e.after as never)},
      ${e.ip ?? null}
    )
  `;
}
