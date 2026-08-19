import { sql } from "@/lib/db";
import { formatMoney, formatDate } from "@/lib/format";
import BankUpload from "@/components/BankUpload";
import {
  toggleIgnoredAction,
  runMatchingAction,
  confirmMatchAction,
  clearMatchAction,
} from "./actions";

const CONFIDENCE_LABEL: Record<string, string> = {
  exact: "ודאי",
  high: "ביטחון גבוה",
  medium: "ביטחון בינוני",
  none: "",
};

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  new: { text: "חדשה", cls: "bg-green-100 text-green-800" },
  matched: { text: "הותאמה", cls: "bg-blue-100 text-blue-800" },
  needs_review: { text: "לבדיקה", cls: "bg-amber-100 text-amber-800" },
  approved: { text: "מאושרת", cls: "bg-blue-100 text-blue-800" },
  issued: { text: "הונפק מסמך", cls: "bg-slate-200 text-slate-700" },
  ignored: { text: "מוחרגת", cls: "bg-amber-100 text-amber-800" },
  failed: { text: "נכשלה", cls: "bg-red-100 text-red-800" },
};

export default async function BankPage() {
  const batches = await sql`
    select * from import_batches order by created_at desc limit 10
  `;
  const transactions = await sql`
    select t.*, c.name as matched_client_name
    from bank_transactions t
    left join clients c on c.id = t.matched_client_id
    order by t.txn_date desc, t.created_at desc
    limit 100
  `;
  const activeClients = await sql`
    select id, name from clients where is_active order by name
  `;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">קליטת דף חשבון</h1>
      <p className="text-sm text-slate-500 mb-6 max-w-2xl">
        ייצוא ידני מאתר הבנק בלבד (עובר ושב ← מידע ← תנועות בחשבון ← ייצוא
        CSV). מעובדות רק שורות זכות; תנועה שנקלטה בעבר לא תיקלט שוב.
      </p>

      <BankUpload />

      {batches.length > 0 && (
        <div className="mt-8">
          <h2 className="font-semibold mb-3">קליטות אחרונות</h2>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="text-right px-4 py-2.5 font-medium">מועד קליטה</th>
                  <th className="text-right px-4 py-2.5 font-medium">קובץ</th>
                  <th className="text-right px-4 py-2.5 font-medium">טווח</th>
                  <th className="text-right px-4 py-2.5 font-medium">תנועות</th>
                  <th className="text-right px-4 py-2.5 font-medium">חדשות</th>
                  <th className="text-right px-4 py-2.5 font-medium">כבר טופלו</th>
                  <th className="text-right px-4 py-2.5 font-medium">הוחרגו</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id as string} className="border-t border-slate-100">
                    <td className="px-4 py-2.5">{formatDate(b.createdAt)}</td>
                    <td className="px-4 py-2.5 text-right" dir="ltr">
                      {b.fileName as string}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {formatDate(b.rangeFrom)} – {formatDate(b.rangeTo)}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">{b.rowsTotal as number}</td>
                    <td className="px-4 py-2.5 tabular-nums text-green-700 font-medium">
                      {b.rowsNew as number}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">{b.rowsDuplicate as number}</td>
                    <td className="px-4 py-2.5 tabular-nums">{b.rowsIgnored as number}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {transactions.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">תנועות שנקלטו</h2>
            <form action={runMatchingAction}>
              <button className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-sm hover:bg-slate-100">
                הרץ התאמה מחדש
              </button>
            </form>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="text-right px-3 py-2.5 font-medium">תאריך</th>
                  <th className="text-right px-3 py-2.5 font-medium">תיאור</th>
                  <th className="text-right px-3 py-2.5 font-medium">משלם</th>
                  <th className="text-right px-3 py-2.5 font-medium">סכום</th>
                  <th className="text-right px-3 py-2.5 font-medium">סטטוס</th>
                  <th className="text-right px-3 py-2.5 font-medium">התאמה ללקוח</th>
                  <th className="text-right px-3 py-2.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => {
                  const st = STATUS_LABEL[t.status as string] ?? {
                    text: t.status as string,
                    cls: "bg-slate-100 text-slate-600",
                  };
                  const canToggle =
                    t.status === "new" ||
                    t.status === "ignored" ||
                    t.status === "needs_review";
                  return (
                    <tr key={t.id as string} className="border-t border-slate-100">
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {formatDate(t.txnDate)}
                      </td>
                      <td className="px-3 py-2.5">{(t.description as string) ?? "—"}</td>
                      <td className="px-3 py-2.5 max-w-md">
                        {t.parsedPayerName ? (
                          <span title={(t.details as string) ?? undefined}>
                            {t.parsedPayerName as string}
                            {t.parsedBankKey ? (
                              <span className="text-xs text-slate-400 mr-1" dir="ltr">
                                ({t.parsedBankKey as string})
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
                      <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">
                        {formatMoney(t.credit)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs ${st.cls}`}
                          title={(t.ignoredReason as string) ?? undefined}
                        >
                          {st.text}
                          {t.ignoredReason ? ` — ${t.ignoredReason}` : ""}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {t.status === "matched" && (
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-blue-800">
                              {t.matchedClientName as string}
                            </span>
                            <span
                              className="text-xs text-slate-400"
                              title={(t.matchReason as string) ?? undefined}
                            >
                              {CONFIDENCE_LABEL[t.matchConfidence as string] ?? ""}
                            </span>
                          </div>
                        )}
                        {(t.status === "new" || t.status === "needs_review") && (
                          <form
                            action={confirmMatchAction}
                            className="flex items-center gap-1.5"
                          >
                            <input type="hidden" name="txnId" value={t.id as string} />
                            <select
                              name="clientId"
                              // key מאלץ רינדור מחדש כשההצעה משתנה — select
                              // לא-מבוקר אינו מתעדכן מ-defaultValue לבדו
                              key={`${t.id}:${t.matchedClientId ?? ""}`}
                              defaultValue={(t.matchedClientId as string) ?? ""}
                              className="px-2 py-1 rounded-md border border-slate-300 bg-white text-xs max-w-40"
                              title={(t.matchReason as string) ?? undefined}
                            >
                              <option value="">— בחר לקוח —</option>
                              {activeClients.map((c) => (
                                <option key={c.id as string} value={c.id as string}>
                                  {c.name as string}
                                </option>
                              ))}
                            </select>
                            <button className="px-2.5 py-1 rounded-md bg-blue-600 text-white text-xs hover:bg-blue-700">
                              אשר
                            </button>
                            {t.matchConfidence &&
                              t.matchConfidence !== "none" && (
                                <span
                                  className="text-xs text-amber-700"
                                  title={(t.matchReason as string) ?? undefined}
                                >
                                  {CONFIDENCE_LABEL[t.matchConfidence as string]}
                                </span>
                              )}
                          </form>
                        )}
                        {t.status !== "matched" &&
                          t.status !== "new" &&
                          t.status !== "needs_review" && <span>—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-left whitespace-nowrap">
                        {t.status === "matched" && (
                          <form action={clearMatchAction.bind(null, t.id as string)}>
                            <button className="text-xs text-slate-500 hover:text-slate-800 underline">
                              בטל התאמה
                            </button>
                          </form>
                        )}
                        {canToggle && (
                          <form
                            action={toggleIgnoredAction.bind(
                              null,
                              t.id as string,
                              t.status !== "ignored"
                            )}
                          >
                            <button className="text-xs text-slate-500 hover:text-slate-800 underline">
                              {t.status === "ignored"
                                ? "החזר לעיבוד"
                                : "לא תשלום לקוח"}
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
