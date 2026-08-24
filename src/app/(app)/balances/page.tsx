import Link from "next/link";
import { sql } from "@/lib/db";
import { getBalancesOverview, currentPeriod } from "@/lib/charges/engine";
import { getCutoffDate } from "@/lib/settings";
import { formatMoney, formatDate } from "@/lib/format";
import { runMonthlyChargesAction, setCutoffAction } from "./actions";
import ActionForm from "@/components/ActionForm";

export const dynamic = "force-dynamic";

export default async function BalancesPage() {
  const rows = await getBalancesOverview(sql);
  const cutoff = await getCutoffDate(sql);
  const [monthlyDone] = await sql`
    select count(*)::int as count from charges
    where source = 'auto_monthly' and period_key = ${currentPeriod()}
  `;

  const totalBalance = rows.reduce((s, r) => s + Number(r.balance), 0);
  const totalPending = rows.reduce((s, r) => s + Number(r.pendingApproval), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">יתרות</h1>
        <ActionForm action={runMonthlyChargesAction}>
          <button className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-sm hover:bg-slate-100">
            הרץ חיוב חודשי ({currentPeriod()})
          </button>
        </ActionForm>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="text-xs text-slate-500">סך יתרות פתוחות</div>
          <div className="text-2xl font-bold mt-1 tabular-nums">
            {formatMoney(totalBalance)}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="text-xs text-slate-500">ממתין לאישור בתור</div>
          <div className="text-2xl font-bold mt-1 tabular-nums text-amber-700">
            {formatMoney(totalPending)}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="text-xs text-slate-500">
            חיובים חודשיים שנוצרו החודש
          </div>
          <div className="text-2xl font-bold mt-1 tabular-nums">
            {monthlyDone.count as number}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="text-xs text-slate-500 mb-1">
            תאריך חתך ליתרות הפתיחה
          </div>
          <div className="text-lg font-bold tabular-nums mb-2">
            {cutoff ? formatDate(cutoff) : "לא הוגדר"}
          </div>
          {/* תנועות עד תאריך זה (כולל) מוחרגות — כבר גולמו ביתרה הידנית */}
          <ActionForm action={setCutoffAction} className="flex gap-1.5">
            <input
              type="date"
              name="cutoffDate"
              defaultValue={cutoff ?? ""}
              className="flex-1 px-2 py-1 rounded-md border border-slate-300 text-xs"
            />
            <button className="px-2.5 py-1 rounded-md bg-slate-800 text-white text-xs hover:bg-slate-700">
              עדכן
            </button>
          </ActionForm>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-right px-4 py-3 font-medium">לקוח</th>
              <th className="text-right px-4 py-3 font-medium">סוג</th>
              <th className="text-right px-4 py-3 font-medium">יתרת פתיחה</th>
              <th className="text-right px-4 py-3 font-medium">סך חיובים</th>
              <th className="text-right px-4 py-3 font-medium">סך שולם</th>
              <th className="text-right px-4 py-3 font-medium">יתרה</th>
              <th className="text-right px-4 py-3 font-medium">
                ממתין לאישור
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  אין לקוחות פעילים
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link
                    href={`/clients/${r.id}`}
                    className="text-blue-700 font-medium hover:underline"
                  >
                    {r.name}
                  </Link>
                </td>
                <td className="px-4 py-3">{r.clientType}</td>
                <td className="px-4 py-3 tabular-nums">
                  {formatMoney(r.openingBalance)}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {formatMoney(r.chargesTotal)}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {formatMoney(r.paidTotal)}
                </td>
                <td
                  className={
                    "px-4 py-3 tabular-nums font-bold " +
                    (Number(r.balance) > 0 ? "text-slate-900" : "text-green-700")
                  }
                >
                  {formatMoney(r.balance)}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {Number(r.pendingApproval) > 0 ? (
                    <Link
                      href="/queue"
                      className="inline-block px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-medium hover:bg-amber-200"
                    >
                      {formatMoney(r.pendingApproval)}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500 max-w-2xl">
        היתרה יורדת כשתשלום מאושר בתור האישורים. &quot;ממתין לאישור&quot; =
        תנועות שהותאמו ללקוח אך טרם אושרו — הכסף בבנק, היתרה עוד לא עודכנה.
        {cutoff &&
          ` תנועות עד ${formatDate(cutoff)} (כולל) אינן נספרות — הן גולמו ביתרות הפתיחה.`}
      </p>
    </div>
  );
}
