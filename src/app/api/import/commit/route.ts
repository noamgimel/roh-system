import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { parseClientsWorkbook } from "@/lib/clients/excel";
import { importClients } from "@/lib/clients/import";
import { getActor } from "@/lib/auth/actor";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "לא צורף קובץ" }, { status: 400 });
    }
    const parsed = await parseClientsWorkbook(await file.arrayBuffer());
    const report = await importClients(sql, parsed, {
      actor: await getActor(),
      fileName: file.name,
      // ברירת מחדל: רק חדשים. עדכון קיימים דורש בחירה מפורשת במסך
      updateExisting: form.get("updateExisting") === "1",
    });
    return NextResponse.json({ data: report });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "שגיאה בייבוא" },
      { status: 500 }
    );
  }
}
