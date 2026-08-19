import Link from "next/link";
import { sql } from "@/lib/db";
import { getBalancesOverview, currentPeriod } from "@/lib/charges/engine";
import { formatMoney } from "@/lib/format";
import { runMonthlyChargesAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function BalancesPage() {
  const rows = await getBalancesOverview(sql);
  const [monthlyDone] = await sql`
    select count(*)::int as count from charges
    where source = 'auto_monthly' and period_key = ${currentPeriod()}
  `;

  const totalBalance = rows.reduce((s, r) => s + Number(r.balance), 0);
  const totalPending = rows.reduce((s, r) => s + Number(r.paidNotIssued), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">יתרות</h1>
        <form action={runMonthlyChargesAction}>
          <button className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-sm hover:bg-slate-100">
            הרץ חיוב חודשי ({currentPeriod()})
          </button>
        </form>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="text-xs text-slate-500">סך יתרות פתוחות</div>
          <div className="text-2xl font-bold mt-1 tabular-nums">
            {formatMoney(totalBalance)}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="text-xs text-slate-500">שולם, טרם הונפק מסמך</div>
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
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-right px-4 py-3 font-medium">לקוח</th>
              <th className="text-right px-4 py-3 font-medium">סוג</th>
              <th className="text-right px-4 py-3 font-medium">יתרת פתיחה</th>
              <th className="text-right px-4 py-3 font-medium">סך חיובים</th>
              <th className="text-right px-4 py-3 font-medium">סך הונפק</th>
              <th className="text-right px-4 py-3 font-medium">יתרה</th>
              <th className="text-right px-4 py-3 font-medium">
                שולם, טרם הונפק
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
                  {formatMoney(r.issuedTotal)}
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
                  {Number(r.paidNotIssued) > 0 ? (
                    <span className="inline-block px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-medium">
                      {formatMoney(r.paidNotIssued)}
                    </span>
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
        היתרה יורדת רק כשמונפק מסמך. &quot;שולם, טרם הונפק&quot; = תנועות בנק
        שהותאמו ללקוח וממתינות להנפקה — הכסף התקבל אך היתרה עוד לא עודכנה.
      </p>
    </div>
  );
}
