import { sql } from "@/lib/db";
import { formatMoney, formatDate } from "@/lib/format";
import SplitDialog from "@/components/SplitDialog";
import {
  confirmMatchAction,
  clearMatchAction,
  approveAction,
  approveAllAction,
  unapproveAction,
  ignoreAction,
  runMatchingAction,
} from "./actions";

export const dynamic = "force-dynamic";

const CONFIDENCE_LABEL: Record<string, string> = {
  exact: "ודאי",
  high: "ביטחון גבוה",
  medium: "ביטחון בינוני",
};

export default async function QueuePage() {
  const pending = await sql`
    select t.*, c.name as matched_client_name
    from bank_transactions t
    left join clients c on c.id = t.matched_client_id
    where t.status in ('new', 'needs_review', 'matched')
    order by t.txn_date, t.created_at
  `;
  const recentApproved = await sql`
    select t.*,
      (select string_agg(cl.name || ' (' || a.amount || ')', ', ')
       from transaction_allocations a join clients cl on cl.id = a.client_id
       where a.bank_transaction_id = t.id) as allocation_summary
    from bank_transactions t
    where t.status = 'approved'
    order by t.txn_date desc limit 15
  `;
  const activeClients = await sql`
    select id, name from clients where is_active order by name
  `;
  const clientOptions = activeClients.map((c) => ({
    id: c.id as string,
    name: c.name as string,
  }));

  const matchedCount = pending.filter((t) => t.status === "matched").length;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold">תור אישורים</h1>
        <div className="flex gap-2">
          <form action={runMatchingAction}>
            <button className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-sm hover:bg-slate-100">
              הרץ התאמה מחדש
            </button>
          </form>
          {matchedCount > 0 && (
            <form action={approveAllAction}>
              <button className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700">
                אשר את כל המותאמות ({matchedCount})
              </button>
            </form>
          )}
        </div>
      </div>
      <p className="text-sm text-slate-500 mb-6 max-w-3xl">
        אישור = התשלום נרשם מול יתרת הלקוח. תשלום מרוכז של כמה לקוחות —
        פצל; תשלום חלקי מאושר כרגיל והיתרה נשארת פתוחה.
      </p>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-right px-3 py-2.5 font-medium">תאריך</th>
              <th className="text-right px-3 py-2.5 font-medium">משלם</th>
              <th className="text-right px-3 py-2.5 font-medium">סכום</th>
              <th className="text-right px-3 py-2.5 font-medium">שיוך ללקוח</th>
              <th className="text-right px-3 py-2.5 font-medium">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {pending.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                  התור ריק — כל התנועות טופלו 🎉
                </td>
              </tr>
            )}
            {pending.map((t) => (
              <tr key={t.id as string} className="border-t border-slate-100 align-top">
                <td className="px-3 py-3 whitespace-nowrap">
                  {formatDate(t.txnDate)}
                </td>
                <td className="px-3 py-3 max-w-56">
                  {t.parsedPayerName ? (
                    <span title={(t.details as string) ?? undefined}>
                      {t.parsedPayerName as string}
                      {t.parsedBankKey ? (
                        <span className="block text-xs text-slate-400" dir="ltr">
                          {t.parsedBankKey as string}
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    <span
                      className="text-slate-400"
                      title={(t.details as string) ?? undefined}
                    >
                      לא זוהה משלם
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 tabular-nums whitespace-nowrap font-medium">
                  {formatMoney(t.credit)}
                </td>
                <td className="px-3 py-3">
                  {t.status === "matched" ? (
                    <div>
                      <span className="font-medium text-blue-800">
                        {t.matchedClientName as string}
                      </span>
                      <span
                        className="block text-xs text-slate-400"
                        title={(t.matchReason as string) ?? undefined}
                      >
                        {CONFIDENCE_LABEL[t.matchConfidence as string] ?? ""}
                      </span>
                    </div>
                  ) : (
                    <form
                      action={confirmMatchAction}
                      className="flex items-center gap-1.5"
                    >
                      <input type="hidden" name="txnId" value={t.id as string} />
                      <select
                        name="clientId"
                        key={`${t.id}:${t.matchedClientId ?? ""}`}
                        defaultValue={(t.matchedClientId as string) ?? ""}
                        className="px-2 py-1 rounded-md border border-slate-300 bg-white text-xs max-w-44"
                        title={(t.matchReason as string) ?? undefined}
                      >
                        <option value="">— בחר לקוח —</option>
                        {clientOptions.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <button className="px-2.5 py-1 rounded-md bg-slate-800 text-white text-xs hover:bg-slate-700">
                        שייך
                      </button>
                      {t.matchConfidence && t.matchConfidence !== "none" && (
                        <span
                          className="text-xs text-amber-700"
                          title={(t.matchReason as string) ?? undefined}
                        >
                          {CONFIDENCE_LABEL[t.matchConfidence as string]}
                        </span>
                      )}
                    </form>
                  )}
                  {t.status === "needs_review" &&
                    t.matchConfidence === "none" && (
                      <div className="text-xs text-amber-700 mt-1">
                        {t.matchReason as string}
                      </div>
                    )}
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3 whitespace-nowrap">
                    {t.status === "matched" && (
                      <>
                        <form action={approveAction.bind(null, t.id as string)}>
                          <button className="px-3 py-1 rounded-md bg-blue-600 text-white text-xs hover:bg-blue-700">
                            אשר תשלום
                          </button>
                        </form>
                        <form action={clearMatchAction.bind(null, t.id as string)}>
                          <button className="text-xs text-slate-500 hover:text-slate-800 underline">
                            בטל שיוך
                          </button>
                        </form>
                      </>
                    )}
                    <SplitDialog
                      txnId={t.id as string}
                      credit={t.credit as string}
                      clients={clientOptions}
                    />
                    <form action={ignoreAction.bind(null, t.id as string)}>
                      <button className="text-xs text-slate-500 hover:text-slate-800 underline">
                        לא תשלום לקוח
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {recentApproved.length > 0 && (
        <div className="mt-8">
          <h2 className="font-semibold mb-3">אושרו לאחרונה</h2>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="text-right px-3 py-2.5 font-medium">תאריך</th>
                  <th className="text-right px-3 py-2.5 font-medium">משלם</th>
                  <th className="text-right px-3 py-2.5 font-medium">סכום</th>
                  <th className="text-right px-3 py-2.5 font-medium">נרשם ללקוחות</th>
                  <th className="text-right px-3 py-2.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {recentApproved.map((t) => (
                  <tr key={t.id as string} className="border-t border-slate-100">
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {formatDate(t.txnDate)}
                    </td>
                    <td className="px-3 py-2.5">
                      {(t.parsedPayerName as string) ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {formatMoney(t.credit)}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">
                      {(t.allocationSummary as string) ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-left">
                      <form action={unapproveAction.bind(null, t.id as string)}>
                        <button className="text-xs text-slate-500 hover:text-slate-800 underline">
                          בטל אישור
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
