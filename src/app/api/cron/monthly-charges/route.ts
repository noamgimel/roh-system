import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { runMonthlyCharges } from "@/lib/charges/engine";

// נקודת הקצה למשימה המתוזמנת ב-n8n (1 לכל חודש).
// מאובטחת בסוד משותף: הכותרת x-cron-secret חייבת להתאים ל-CRON_SECRET.
// גוף אופציונלי: { "period": "YYYY-MM" } — ברירת מחדל: החודש הנוכחי.

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET אינו מוגדר בסביבה" },
      { status: 500 }
    );
  }
  if (req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const report = await runMonthlyCharges(sql, {
      period: typeof body.period === "string" ? body.period : undefined,
      actor: "n8n-cron",
    });
    return NextResponse.json({ data: report });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "שגיאה בהרצת החיוב החודשי" },
      { status: 500 }
    );
  }
}
