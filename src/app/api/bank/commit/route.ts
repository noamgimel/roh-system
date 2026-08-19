import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { parseBankCsv } from "@/lib/bank/csv";
import { commitBankFile } from "@/lib/bank/import";
import { CURRENT_ACTOR } from "@/lib/format";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "לא צורף קובץ" }, { status: 400 });
    }
    const parsed = parseBankCsv(Buffer.from(await file.arrayBuffer()));
    const report = await commitBankFile(sql, parsed, {
      actor: CURRENT_ACTOR,
      fileName: file.name,
    });
    return NextResponse.json({ data: report });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "שגיאה בקליטה" },
      { status: 500 }
    );
  }
}
