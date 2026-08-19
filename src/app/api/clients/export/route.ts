import { sql } from "@/lib/db";
import { exportClientsWorkbook } from "@/lib/clients/export";
import { writeAudit } from "@/lib/audit";
import { CURRENT_ACTOR } from "@/lib/format";

export async function GET() {
  const buffer = await exportClientsWorkbook(sql);
  await writeAudit(sql, {
    actor: CURRENT_ACTOR,
    action: "clients_export",
    entity: "clients",
  });
  const fileName = `clients-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
