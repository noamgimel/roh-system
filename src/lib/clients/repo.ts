import type { Sql } from "postgres";
import { writeAudit } from "@/lib/audit";
import { normalizeTaxId } from "./normalize";

export interface ClientInput {
  clientNo?: number | null;
  taxId: string;
  name: string;
  activity?: string | null;
  entityType?: string | null;
  withholdingFile?: string | null;
  spouseName?: string | null;
  spouseTaxId?: string | null;
  vatFrequency?: string | null;
  ni102Frequency?: string | null;
  tax102Frequency?: string | null;
  advancesRate?: number | null;
  advancesFrequency?: string | null;
  permissions?: string | null;
  phone?: string | null;
  email?: string | null;
  clientType?: "קבוע" | "מזדמן";
  rate?: number | null;
  openingBalance?: number;
  isActive?: boolean;
  notes?: string | null;
}

// שמות העמודות בפועל (snake_case) — postgres.js ממיר מ-camelCase בעצמו
const CLIENT_FIELDS = [
  "client_no",
  "tax_id",
  "name",
  "activity",
  "entity_type",
  "withholding_file",
  "spouse_name",
  "spouse_tax_id",
  "vat_frequency",
  "ni_102_frequency",
  "tax_102_frequency",
  "form_126",
  "advances_rate",
  "advances_frequency",
  "permissions",
  "phone",
  "email",
  "client_type",
  "rate",
  "opening_balance",
  "is_active",
  "notes",
] as const;

function toRecord(input: Partial<ClientInput>): Record<string, unknown> {
  const camelToSnake = (s: string) =>
    s.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase()).replace(/(\d+)/g, "_$1");
  const record: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    // ni102Frequency → ni_102_frequency וכד'
    const snake = camelToSnake(k).replace(/__+/g, "_");
    if ((CLIENT_FIELDS as readonly string[]).includes(snake)) record[snake] = v;
  }
  if ("tax_id" in record) {
    const normalized = normalizeTaxId(record.tax_id);
    if (!normalized) throw new Error('מספר ת"ז/ח"פ לא תקין');
    record.tax_id = normalized;
  }
  return record;
}

export interface ListClientsFilter {
  search?: string;
  clientType?: "קבוע" | "מזדמן";
  isActive?: boolean;
}

export async function listClients(sql: Sql, filter: ListClientsFilter = {}) {
  const search = filter.search ? `%${filter.search.trim()}%` : null;
  return sql`
    select c.*, b.balance
    from clients c
    left join client_balances b on b.id = c.id
    where true
      ${search ? sql`and (c.name ilike ${search} or c.tax_id like ${search})` : sql``}
      ${filter.clientType ? sql`and c.client_type = ${filter.clientType}` : sql``}
      ${filter.isActive !== undefined ? sql`and c.is_active = ${filter.isActive}` : sql``}
    order by c.name
  `;
}

export async function getClient(sql: Sql, id: string) {
  const rows = await sql`
    select c.*, b.balance
    from clients c
    left join client_balances b on b.id = c.id
    where c.id = ${id}
  `;
  return rows[0] ?? null;
}

export async function createClient(
  sql: Sql,
  input: ClientInput,
  actor: string
) {
  const record = toRecord(input);
  if (!record.name) throw new Error("חסר שם לקוח");
  if (!record.tax_id) throw new Error('חסר מספר ת"ז/ח"פ');

  return sql.begin(async (tx) => {
    const [created] = await tx`
      insert into clients ${tx(record)} returning *
    `;
    await writeAudit(tx, {
      actor,
      action: "client_create",
      entity: "clients",
      entityId: created.id as string,
      after: record,
    });
    return created;
  });
}

export async function updateClient(
  sql: Sql,
  id: string,
  input: Partial<ClientInput>,
  actor: string
) {
  const record = toRecord(input);
  if (Object.keys(record).length === 0) return null;

  return sql.begin(async (tx) => {
    const [before] = await tx`select * from clients where id = ${id}`;
    if (!before) throw new Error("לקוח לא נמצא");
    const [updated] = await tx`
      update clients set ${tx(record)} where id = ${id} returning *
    `;
    await writeAudit(tx, {
      actor,
      action: "client_update",
      entity: "clients",
      entityId: id,
      before,
      after: record,
    });
    return updated;
  });
}
