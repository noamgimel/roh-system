import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { getActor } from "@/lib/auth/actor";
import { maskClientsExcel, maskBankCsvFile } from "@/lib/masking/files";

// כלי המיסוך — זמני לתקופת הפיתוח. עיבוד בזיכרון בלבד:
// הקובץ לא נכתב לדיסק, לא נשמר ב-DB, ולא נשלח לשום שירות חיצוני.
// מוגן ב-session כמו כל ה-API (middleware).

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "לא צורף קובץ" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const lower = file.name.toLowerCase();

    let masked: Buffer;
    let contentType: string;
    if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
      masked = await maskClientsExcel(buffer);
      contentType =
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    } else if (lower.endsWith(".csv")) {
      masked = maskBankCsvFile(buffer);
      contentType = "text/csv; charset=windows-1255";
    } else {
      return NextResponse.json(
        { error: "פורמט לא נתמך — העלה xlsx (לקוחות) או csv (בנק)" },
        { status: 400 }
      );
    }

    // ביומן נרשמת הפעולה בלבד — לעולם לא תוכן הקובץ
    await writeAudit(sql, {
      actor: await getActor(),
      action: "mask_file",
      entity: "masking",
      after: { file_name: file.name, size_bytes: buffer.length },
    });

    return new Response(new Uint8Array(masked), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="masked-${encodeURIComponent(file.name)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "שגיאה במיסוך" },
      { status: 500 }
    );
  }
}
