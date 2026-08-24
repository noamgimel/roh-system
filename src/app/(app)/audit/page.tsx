import Link from "next/link";
import { sql } from "@/lib/db";
import { listAudit, listAuditEntities } from "@/lib/audit-query";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

// תרגום קודי פעולה לעברית — קוד לא מוכר מוצג כפי שהוא
const ACTION_LABELS: Record<string, string> = {
  clients_import: "ייבוא לקוחות מאקסל",
  clients_export: "ייצוא לקוחות לאקסל",
  client_create: "יצירת לקוח",
  client_update: "עדכון לקוח",
  bank_import: "קליטת דף חשבון",
  bank_txn_ignore: "החרגת תנועה",
  bank_txn_unignore: "החזרת תנועה לעיבוד",
  match_run: "הרצת מנוע התאמה",
  match_confirm: "שיוך תנועה ללקוח",
  match_clear: "ביטול שיוך",
  payment_approve: "אישור תשלום",
  payment_split: "פיצול תשלום",
  payment_unapprove: "ביטול אישור תשלום",
  monthly_charges_run: "הרצת חיוב חודשי",
  charge_create_manual: "חיוב ידני",
  setting_update: "עדכון הגדרה",
  user_create: "יצירת משתמש",
  login_success: "התחברות",
  login_failure: "התחברות כושלת",
  logout: "התנתקות",
};

const ENTITY_LABELS: Record<string, string> = {
  clients: "לקוחות",
  bank_transactions: "תנועות בנק",
  import_batches: "קליטות דף חשבון",
  charges: "חיובים",
  app_settings: "הגדרות",
  users: "משתמשים",
};

function fmtTime(v: unknown): string {
  return new Intl.DateTimeFormat("he-IL", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(v as string));
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    entity?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const page = Math.max(Number(params.page) || 0, 0);
  const filter = {
    entity: params.entity || undefined,
    from: params.from || undefined,
    to: params.to || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  };
  const [{ rows, hasMore }, entities] = await Promise.all([
    listAudit(sql, filter),
    listAuditEntities(sql),
  ]);

  const baseQuery = new URLSearchParams();
  if (params.entity) baseQuery.set("entity", params.entity);
  if (params.from) baseQuery.set("from", params.from);
  if (params.to) baseQuery.set("to", params.to);
  const pageHref = (p: number) => {
    const q = new URLSearchParams(baseQuery);
    if (p > 0) q.set("page", String(p));
    const s = q.toString();
    return `/audit${s ? `?${s}` : ""}`;
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">יומן ביקורת</h1>
      <p className="text-sm text-slate-500 mb-6">
        לקריאה בלבד — כל פעולה מהותית במערכת נרשמת כאן, כולל מי, מתי
        ומאיזו כתובת.
      </p>

      <form className="flex flex-wrap gap-2 mb-4 items-end" method="get">
        <label className="block">
          <span className="block text-xs text-slate-500 mb-1">ישות</span>
          <select
            name="entity"
            defaultValue={params.entity ?? ""}
            className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
          >
            <option value="">כל הישויות</option>
            {entities.map((e) => (
              <option key={e} value={e}>
                {ENTITY_LABELS[e] ?? e}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs text-slate-500 mb-1">מתאריך</span>
          <input
            type="date"
            name="from"
            defaultValue={params.from ?? ""}
            className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
          />
        </label>
        <label className="block">
          <span className="block text-xs text-slate-500 mb-1">עד תאריך</span>
          <input
            type="date"
            name="to"
            defaultValue={params.to ?? ""}
            className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
          />
        </label>
        <button className="px-4 py-2 rounded-lg bg-slate-800 text-white text-sm hover:bg-slate-700">
          סינון
        </button>
        {(params.entity || params.from || params.to) && (
          <Link
            href="/audit"
            className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-sm hover:bg-slate-100"
          >
            נקה סינון
          </Link>
        )}
      </form>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-right px-4 py-2.5 font-medium">מועד</th>
              <th className="text-right px-4 py-2.5 font-medium">מבצע</th>
              <th className="text-right px-4 py-2.5 font-medium">פעולה</th>
              <th className="text-right px-4 py-2.5 font-medium">ישות</th>
              <th className="text-right px-4 py-2.5 font-medium">IP</th>
              <th className="text-right px-4 py-2.5 font-medium">פרטים</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  אין רשומות בטווח שנבחר
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id as string} className="border-t border-slate-100 align-top">
                <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">
                  {fmtTime(r.createdAt)}
                </td>
                <td className="px-4 py-2.5" dir="ltr">
                  {r.actor as string}
                </td>
                <td className="px-4 py-2.5">
                  {ACTION_LABELS[r.action as string] ?? (r.action as string)}
                </td>
                <td className="px-4 py-2.5 text-slate-500">
                  {ENTITY_LABELS[r.entity as string] ?? (r.entity as string)}
                </td>
                <td className="px-4 py-2.5 text-slate-400 text-xs" dir="ltr">
                  {r.ip ? String(r.ip) : "—"}
                </td>
                <td className="px-4 py-2.5">
                  {r.beforeData || r.afterData ? (
                    <details>
                      <summary className="cursor-pointer text-xs text-blue-700 hover:underline">
                        הצג
                      </summary>
                      <pre
                        dir="ltr"
                        className="mt-1 text-[11px] bg-slate-50 rounded p-2 max-w-md overflow-x-auto text-left"
                      >
                        {JSON.stringify(
                          {
                            ...(r.beforeData ? { before: r.beforeData } : {}),
                            ...(r.afterData ? { after: r.afterData } : {}),
                          },
                          null,
                          1
                        )}
                      </pre>
                    </details>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 mt-4 text-sm">
        {page > 0 && (
          <Link
            href={pageHref(page - 1)}
            className="px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100"
          >
            → חדשות יותר
          </Link>
        )}
        {hasMore && (
          <Link
            href={pageHref(page + 1)}
            className="px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100"
          >
            ישנות יותר ←
          </Link>
        )}
        <span className="text-xs text-slate-400 mr-auto">
          עמוד {page + 1} · {rows.length} רשומות
          {params.from || params.to || params.entity ? " (מסונן)" : ""}
        </span>
      </div>
    </div>
  );
}
