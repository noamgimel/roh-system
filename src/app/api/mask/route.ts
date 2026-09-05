import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { getActor } from "@/lib/auth/actor";
import { maskExcelFile, maskBankCsvFile } from "@/lib/masking/files";
import { describeNotXlsx, isXlsxBuffer, looksLikeCsv } from "@/lib/excel-guard";

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

    // הסוג נקבע לפי התוכן, לא לפי הסיומת — macOS מסתיר סיומות, וקובץ
    // שיוצא מ-Numbers/אקסל בלי סיומת עדיין צריך לעבוד.
    let masked: Buffer;
    let contentType: string;
    let kind = "csv";
    let outExt: string;
    if (isXlsxBuffer(buffer)) {
      const result = await maskExcelFile(buffer);
      masked = result.masked;
      kind = result.kind;
      contentType =
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      outExt = ".xlsx";
    } else if (looksLikeCsv(buffer)) {
      masked = maskBankCsvFile(buffer);
      contentType = "text/csv; charset=windows-1255";
      outExt = ".csv";
    } else {
      const problem =
        describeNotXlsx(buffer, file.name) ??
        "פורמט לא מזוהה — העלה חוברת אקסל (xlsx) או CSV";
      return NextResponse.json({ error: problem }, { status: 400 });
    }
    // שם הפלט תמיד עם הסיומת הנכונה, גם אם המקור הגיע בלי
    const baseName = file.name.replace(/\.(xlsx|xls|csv|numbers)$/i, "");

    // ביומן נרשמת הפעולה בלבד — לעולם לא תוכן הקובץ
    await writeAudit(sql, {
      actor: await getActor(),
      action: "mask_file",
      entity: "masking",
      after: { file_name: file.name, size_bytes: buffer.length, kind },
    });

    return new Response(new Uint8Array(masked), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="masked-${encodeURIComponent(baseName)}${outExt}"`,
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
