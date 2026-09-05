import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { parseBankFile } from "@/lib/bank/xlsx";
import { commitBankFile } from "@/lib/bank/import";
import { runMatching } from "@/lib/match/engine";
import { getActor } from "@/lib/auth/actor";

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
    const report = await commitBankFile(sql, parsed, {
      actor: await getActor(),
      fileName: file.name,
    });
    // מיד אחרי הקליטה — הרצת מנוע ההתאמה על התנועות הפתוחות
    const matching = await runMatching(sql, { actor: await getActor() });
    return NextResponse.json({ data: { ...report, matching } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "שגיאה בקליטה" },
      { status: 500 }
    );
  }
}
