import { NextResponse } from "next/server";
import { parseClientsWorkbook } from "@/lib/clients/excel";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "לא צורף קובץ" }, { status: 400 });
    }
    const parsed = await parseClientsWorkbook(await file.arrayBuffer());

    const valid = parsed.rows.filter((r) => r.errors.length === 0);
    const failed = parsed.rows.filter((r) => r.errors.length > 0);

    return NextResponse.json({
      data: {
        fileName: file.name,
        headerRowNumber: parsed.headerRowNumber,
        columns: parsed.columns,
        unmappedHeaders: parsed.unmappedHeaders,
        totalRows: parsed.rows.length,
        validCount: valid.length,
        failedRows: failed.map((r) => ({
          rowNumber: r.rowNumber,
          name: (r.data.name as string) ?? null,
          errors: r.errors,
          // כל מה שכן נקרא מהשורה — להשלמה ידנית בטופס לקוח חדש
          data: r.data,
        })),
        sample: valid.slice(0, 10).map((r) => r.data),
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "שגיאה בפענוח הקובץ" },
      { status: 400 }
    );
  }
}
