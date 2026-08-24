import Link from "next/link";
import { notFound } from "next/navigation";
import BackLink from "@/components/BackLink";
import { sql } from "@/lib/db";
import { getClient } from "@/lib/clients/repo";
import { formatMoney, formatDate } from "@/lib/format";
import { createChargeAction } from "../actions";

export const dynamic = "force-dynamic";

function Detail({ label, value, dir }: { label: string; value: unknown; dir?: "ltr" }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-sm mt-0.5" dir={dir}>
        {value === null || value === undefined || value === "" ? "—" : String(value)}
      </dd>
    </div>
  );
}

export default async function ClientCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await getClient(sql, id);
  if (!client) notFound();

  const charges = await sql`
    select * from charges where client_id = ${id}
    order by charge_date desc limit 50
  `;
  // תשלומים שנרשמו מול היתרה — שיוכי תנועות מאושרות
  const payments = await sql`
    select a.amount, t.txn_date, t.status, t.parsed_payer_name
    from transaction_allocations a
    join bank_transactions t on t.id = a.bank_transaction_id
    where a.client_id = ${id}
    order by t.txn_date desc limit 50
  `;

  return (
    <div>
      <BackLink href="/clients" label="רשימת הלקוחות" />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{client.name as string}</h1>
          <div className="text-sm text-slate-500 mt-1">
            {client.clientType as string} ·{" "}
            {client.isActive ? "פעיל" : "לא פעיל"} · ת&quot;ז/ח&quot;פ{" "}
            <span dir="ltr">{client.taxId as string}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/clients/${id}/edit`}
            className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-sm hover:bg-slate-100"
          >
            עריכה
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="text-xs text-slate-500">יתרה נוכחית</div>
          <div className="text-2xl font-bold mt-1 tabular-nums">
            {client.isActive ? formatMoney(client.balance) : "—"}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="text-xs text-slate-500">תעריף חודשי</div>
          <div className="text-2xl font-bold mt-1 tabular-nums">
            {client.rate ? formatMoney(client.rate) : "—"}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="text-xs text-slate-500">יתרת פתיחה</div>
          <div className="text-2xl font-bold mt-1 tabular-nums">
            {formatMoney(client.openingBalance)}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <h2 className="font-semibold mb-4">פרטי הלקוח</h2>
        <dl className="grid grid-cols-4 gap-4">
          <Detail label="תחום פעילות" value={client.activity} />
          <Detail label="סוג ישות" value={client.entityType} />
          <Detail label="תיק ניכויים" value={client.withholdingFile} dir="ltr" />
          <Detail label="טלפון" value={client.phone} dir="ltr" />
          <Detail label="אימייל" value={client.email} dir="ltr" />
          <Detail label='תדירות מע"מ' value={client.vatFrequency} />
          <Detail label="102 ביטוח לאומי" value={client.ni102Frequency} />
          <Detail label="102 מס הכנסה" value={client.tax102Frequency} />
          <Detail label="שיעור מקדמות" value={client.advancesRate} />
          <Detail label="תדירות מקדמות" value={client.advancesFrequency} />
          <Detail label="הרשאות" value={client.permissions} />
          <Detail label="בן/בת זוג" value={client.spouseName} />
          <Detail label='ת"ז בן/בת זוג' value={client.spouseTaxId} dir="ltr" />
        </dl>
        {typeof client.notes === "string" && client.notes && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="text-xs text-slate-500 mb-1">הערות</div>
            <div className="text-sm whitespace-pre-wrap">{client.notes}</div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">היסטוריית חיובים</h2>
          </div>
          {/* חיוב חד-פעמי ידני — בעיקר ללקוח מזדמן כשמסופק שירות */}
          <form
            action={createChargeAction.bind(null, id)}
            className="flex items-end gap-2 mb-4 pb-4 border-b border-slate-100"
          >
            <label className="block flex-1">
              <span className="block text-xs text-slate-500 mb-1">סכום (₪)</span>
              <input
                type="number"
                name="amount"
                step="0.01"
                min="0.01"
                required
                dir="ltr"
                className="w-full px-2 py-1.5 rounded-md border border-slate-300 text-sm text-right"
              />
            </label>
            <label className="block">
              <span className="block text-xs text-slate-500 mb-1">תאריך</span>
              <input
                type="date"
                name="chargeDate"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
                className="px-2 py-1.5 rounded-md border border-slate-300 text-sm"
              />
            </label>
            <label className="block flex-1">
              <span className="block text-xs text-slate-500 mb-1">תיאור</span>
              <input
                type="text"
                name="description"
                className="w-full px-2 py-1.5 rounded-md border border-slate-300 text-sm"
              />
            </label>
            <button className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700">
              הוסף חיוב
            </button>
          </form>
          {charges.length === 0 ? (
            <div className="text-sm text-slate-500">אין חיובים עדיין</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-slate-500 text-xs">
                <tr>
                  <th className="text-right pb-2">תאריך</th>
                  <th className="text-right pb-2">סכום</th>
                  <th className="text-right pb-2">מקור</th>
                </tr>
              </thead>
              <tbody>
                {charges.map((ch) => (
                  <tr key={ch.id as string} className="border-t border-slate-100">
                    <td className="py-2">{formatDate(ch.chargeDate)}</td>
                    <td className="py-2 tabular-nums">{formatMoney(ch.amount)}</td>
                    <td className="py-2 text-slate-500">
                      {ch.source === "auto_monthly"
                        ? "חיוב חודשי"
                        : ch.source === "opening"
                          ? "יתרת פתיחה"
                          : "ידני"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="font-semibold mb-4">תשלומים שנרשמו</h2>
          {payments.length === 0 ? (
            <div className="text-sm text-slate-500">
              אין תשלומים עדיין — תשלום נרשם כאן לאחר אישורו בתור האישורים
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-slate-500 text-xs">
                <tr>
                  <th className="text-right pb-2">תאריך תשלום</th>
                  <th className="text-right pb-2">סכום</th>
                  <th className="text-right pb-2">משלם</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="py-2">{formatDate(p.txnDate)}</td>
                    <td className="py-2 tabular-nums">{formatMoney(p.amount)}</td>
                    <td className="py-2 text-slate-600">
                      {(p.parsedPayerName as string) ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
