import type { Sql, TransactionSql } from "postgres";
import { writeAudit } from "@/lib/audit";
import { createClient, type ClientInput } from "./repo";
import type { ExcelClientField } from "./excel";

// שורות ייבוא ממתינות: לקוח שלא נקלט (בדרך כלל חסר ת"ז) נשאר במסך
// הייבוא — לא נעלם עם הרענון — עד שמשלימים אותו ידנית או מוחקים.

export interface PendingRow {
  id: string;
  sourceFile: string | null;
  rowNumber: number | null;
  name: string | null;
  data: Partial<Record<ExcelClientField, unknown>>;
  errors: string[];
  createdAt: Date;
}

export async function savePendingRows(
  tx: TransactionSql,
  rows: { rowNumber: number; errors: string[]; data: Record<string, unknown> }[],
  sourceFile: string | null
): Promise<number> {
  let saved = 0;
  for (const r of rows) {
    const res = await tx`
      insert into client_import_pending (source_file, row_number, name, data, errors)
      values (${sourceFile}, ${r.rowNumber}, ${(r.data.name as string) ?? null},
              ${tx.json(r.data as never)}, ${r.errors})
      on conflict (source_file, row_number) do update
        set data = excluded.data, errors = excluded.errors, name = excluded.name
      returning (xmax = 0) as is_new
    `;
    if (res[0]?.isNew) saved++;
  }
  return saved;
}

export async function listPending(sql: Sql): Promise<PendingRow[]> {
  const rows = await sql`
    select * from client_import_pending order by created_at, row_number
  `;
  return rows as unknown as PendingRow[];
}

const SNAKE_TO_INPUT: Record<string, keyof ClientInput> = {
  client_no: "clientNo",
  tax_id: "taxId",
  name: "name",
  activity: "activity",
  entity_type: "entityType",
  withholding_file: "withholdingFile",
  spouse_name: "spouseName",
  spouse_tax_id: "spouseTaxId",
  vat_frequency: "vatFrequency",
  ni_102_frequency: "ni102Frequency",
  tax_102_frequency: "tax102Frequency",
  advances_rate: "advancesRate",
  advances_frequency: "advancesFrequency",
  permissions: "permissions",
  phone: "phone",
  email: "email",
  rate: "rate",
  is_active: "isActive",
};

/**
 * השלמת שורה ממתינה: יוצר לקוח מכל מה שנקרא מהאקסל + מה שהמשתמש
 * השלים (ת"ז, ואם צריך גם שם), ומסיר את השורה מהרשימה.
 */
export async function resolvePending(
  sql: Sql,
  pendingId: string,
  completion: { taxId: string; name?: string | null },
  actor: string
) {
  const [row] = await sql`
    select * from client_import_pending where id = ${pendingId}
  `;
  if (!row) throw new Error("השורה הממתינה לא נמצאה — אולי כבר טופלה");

  const input: Partial<ClientInput> = {};
  for (const [snake, camel] of Object.entries(SNAKE_TO_INPUT)) {
    const v = (row.data as Record<string, unknown>)[snake];
    if (v !== null && v !== undefined && v !== "") {
      (input as Record<string, unknown>)[camel] = v;
    }
  }
  input.taxId = completion.taxId;
  if (completion.name) input.name = completion.name;
  if (!input.name) throw new Error("חסר שם לקוח");

  const created = await createClient(sql, input as ClientInput, actor);
  await sql.begin(async (tx) => {
    await tx`delete from client_import_pending where id = ${pendingId}`;
    await writeAudit(tx, {
      actor,
      action: "import_pending_resolve",
      entity: "client_import_pending",
      entityId: pendingId,
      after: { client_id: created.id, name: input.name, tax_id: completion.taxId },
    });
  });
  return created;
}

export async function deletePending(sql: Sql, pendingId: string, actor: string) {
  await sql.begin(async (tx) => {
    const deleted = await tx`
      delete from client_import_pending where id = ${pendingId} returning name, row_number
    `;
    if (deleted.length === 0) throw new Error("השורה הממתינה לא נמצאה");
    await writeAudit(tx, {
      actor,
      action: "import_pending_delete",
      entity: "client_import_pending",
      entityId: pendingId,
      before: { name: deleted[0].name, row_number: deleted[0].rowNumber },
    });
  });
}
