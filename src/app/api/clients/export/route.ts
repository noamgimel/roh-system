import { sql } from "@/lib/db";
import { exportClientsWorkbook } from "@/lib/clients/export";
import { writeAudit } from "@/lib/audit";
import { getActor } from "@/lib/auth/actor";

export async function GET() {
  try {
    return await doExport();
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "שגיאה בייצוא" },
      { status: 500 }
    );
  }
}

async function doExport() {
  const buffer = await exportClientsWorkbook(sql);
  await writeAudit(sql, {
    actor: await getActor(),
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
