import Link from "next/link";
import { sql } from "@/lib/db";
import { listClients } from "@/lib/clients/repo";
import { formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; status?: string }>;
}) {
  const params = await searchParams;
  const clients = await listClients(sql, {
    search: params.q,
    clientType: params.type === "קבוע" || params.type === "מזדמן"
      ? params.type
      : undefined,
    isActive:
      params.status === "פעיל" ? true :
      params.status === "לא פעיל" ? false : undefined,
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">לקוחות</h1>
        <div className="flex gap-2">
          <a
            href="/api/clients/export"
            className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-sm hover:bg-slate-100"
          >
            ייצוא לאקסל
          </a>
          <Link
            href="/clients/new"
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700"
          >
            + לקוח חדש
          </Link>
        </div>
      </div>

      <form className="flex gap-2 mb-4" method="get">
        <input
          type="search"
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="חיפוש לפי שם או ת&quot;ז…"
          className="flex-1 max-w-xs px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
        />
        <select
          name="type"
          defaultValue={params.type ?? ""}
          className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
        >
          <option value="">כל הסוגים</option>
          <option value="קבוע">קבוע</option>
          <option value="מזדמן">מזדמן</option>
        </select>
        <select
          name="status"
          defaultValue={params.status ?? ""}
          className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
        >
          <option value="">כל הסטטוסים</option>
          <option value="פעיל">פעיל</option>
          <option value="לא פעיל">לא פעיל</option>
        </select>
        <button className="px-4 py-2 rounded-lg bg-slate-800 text-white text-sm hover:bg-slate-700">
          סינון
        </button>
      </form>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-right px-4 py-3 font-medium">שם</th>
              <th className="text-right px-4 py-3 font-medium">ת&quot;ז / ח&quot;פ</th>
              <th className="text-right px-4 py-3 font-medium">סוג</th>
              <th className="text-right px-4 py-3 font-medium">תעריף חודשי</th>
              <th className="text-right px-4 py-3 font-medium">יתרה</th>
              <th className="text-right px-4 py-3 font-medium">סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  אין לקוחות עדיין — התחל בייבוא האקסל או צור לקוח חדש
                </td>
              </tr>
            )}
            {clients.map((c) => (
              <tr key={c.id as string} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link
                    href={`/clients/${c.id}`}
                    className="text-blue-700 font-medium hover:underline"
                  >
                    {c.name as string}
                  </Link>
                </td>
                {/* dir=ltr לספרות, אבל היישור נשאר לימין כמו הכותרת */}
                <td className="px-4 py-3 tabular-nums text-right" dir="ltr">
                  {c.taxId as string}
                </td>
                <td className="px-4 py-3">{c.clientType as string}</td>
                <td className="px-4 py-3 tabular-nums">
                  {c.rate ? formatMoney(c.rate) : "—"}
                </td>
                <td className="px-4 py-3 tabular-nums font-medium">
                  {c.balance !== null ? formatMoney(c.balance) : "—"}
                </td>
                <td className="px-4 py-3">
                  {c.isActive ? (
                    <span className="inline-block px-2 py-0.5 rounded-full bg-green-100 text-green-800 text-xs">
                      פעיל
                    </span>
                  ) : (
                    <span className="inline-block px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 text-xs">
                      לא פעיל
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 text-xs text-slate-500">
        {clients.length} לקוחות מוצגים
      </div>
    </div>
  );
}
