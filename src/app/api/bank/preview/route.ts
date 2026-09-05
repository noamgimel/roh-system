import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { parseBankFile } from "@/lib/bank/xlsx";
import { previewBankFile } from "@/lib/bank/import";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "לא צורף קובץ" }, { status: 400 });
    }
    const parsed = await parseBankFile(
      Buffer.from(await file.arrayBuffer()),
      file.name
    );
    const preview = await previewBankFile(sql, parsed, file.name);
    return NextResponse.json({ data: preview });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "שגיאה בפענוח הקובץ" },
      { status: 400 }
    );
  }
}
