import BackLink from "@/components/BackLink";
import ActionForm from "@/components/ActionForm";
import ImportUpload from "@/components/ImportUpload";
import { sql } from "@/lib/db";
import { listPending } from "@/lib/clients/pending";
import { resolvePendingAction, deletePendingAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const pending = await listPending(sql);

  return (
    <div>
      <BackLink href="/clients" label="רשימת הלקוחות" />
      <h1 className="text-2xl font-bold mb-2">ייבוא לקוחות</h1>
      <p className="text-sm text-slate-500 mb-6 max-w-2xl">
        האקסל של המשרד הוא מקור האמת — המערכת מייבאת ומייצאת, לא מחליפה.
        לקוח קיים (לפי ת&quot;ז/ח&quot;פ) יעודכן רק אם תבחר בכך; לקוח חדש ייווצר.
        תעריף, יתרת פתיחה וסוג לקוח שהוגדרו במערכת אינם נדרסים בייבוא.
      </p>

      <ImportUpload />

      {pending.length > 0 && (
        <div id="pending" className="mt-8 max-w-4xl">
          <h2 className="font-semibold mb-1">
            ממתינים להשלמה ({pending.length})
          </h2>
          <p className="text-xs text-slate-500 mb-3">
            לקוחות מהאקסל שלא נקלטו — בדרך כלל כי חסר ת&quot;ז/ח&quot;פ. השלם את
            החסר ולחץ &quot;צור לקוח&quot;, או מחק. הם יישארו כאן עד שתטפל בהם.
          </p>
          <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-amber-50 text-slate-600">
                <tr>
                  <th className="text-right px-3 py-2.5 font-medium w-16">שורה</th>
                  <th className="text-right px-3 py-2.5 font-medium">שם</th>
                  <th className="text-right px-3 py-2.5 font-medium">מה חסר</th>
                  <th className="text-right px-3 py-2.5 font-medium">השלמה</th>
                  <th className="w-20"></th>
                </tr>
              </thead>
              <tbody>
                {pending.map((r) => {
                  const needsName = !r.name;
                  return (
                    <tr key={r.id} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-2.5 text-slate-500">
                        {r.rowNumber ?? "—"}
                        {r.sourceFile && (
                          <div className="text-[10px] text-slate-400 truncate max-w-24" title={r.sourceFile}>
                            {r.sourceFile}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-medium">{r.name ?? <span className="text-slate-400">ללא שם</span>}</td>
                      <td className="px-3 py-2.5 text-red-700 text-xs">{r.errors.join("; ")}</td>
                      <td className="px-3 py-2.5">
                        <ActionForm action={resolvePendingAction} className="flex items-center gap-1.5 flex-wrap">
                          <input type="hidden" name="pendingId" value={r.id} />
                          {needsName && (
                            <input
                              type="text"
                              name="name"
                              required
                              placeholder="שם הלקוח"
                              className="px-2 py-1 rounded-md border border-slate-300 text-xs w-36"
                            />
                          )}
                          <input
                            type="text"
                            name="taxId"
                            required
                            dir="ltr"
                            inputMode="numeric"
                            placeholder='ת"ז / ח"פ'
                            className="px-2 py-1 rounded-md border border-slate-300 text-xs w-32 text-right"
                          />
                          <button className="px-3 py-1 rounded-md bg-blue-600 text-white text-xs hover:bg-blue-700">
                            צור לקוח
                          </button>
                        </ActionForm>
                      </td>
                      <td className="px-3 py-2.5 text-left">
                        <ActionForm action={deletePendingAction.bind(null, r.id)}>
                          <button className="text-xs text-slate-500 hover:text-red-700 underline">
                            מחק
                          </button>
                        </ActionForm>
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
