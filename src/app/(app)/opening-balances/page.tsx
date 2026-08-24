import Link from "next/link";
import BackLink from "@/components/BackLink";
import { sql } from "@/lib/db";
import { getCutoffDate } from "@/lib/settings";
import { formatDate } from "@/lib/format";
import OpeningBalancesTable, {
  type OpeningBalanceRow,
} from "@/components/OpeningBalancesTable";

export const dynamic = "force-dynamic";

export default async function OpeningBalancesPage() {
  const cutoff = await getCutoffDate(sql);
  const rows = await sql`
    select c.id, c.name, c.client_type, c.tax_id, c.opening_balance, b.balance
    from clients c
    join client_balances b on b.id = c.id
    where c.is_active
    order by c.client_no nulls last, c.name
  `;

  const tableRows: OpeningBalanceRow[] = rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    clientType: r.clientType as string,
    taxId: r.taxId as string,
    openingBalance: String(r.openingBalance),
    balance: String(r.balance),
  }));

  return (
    <div>
      <BackLink href="/balances" label="מסך היתרות" />
      <h1 className="text-2xl font-bold mb-2">הזנת יתרות פתיחה</h1>
      <p className="text-sm text-slate-500 mb-4 max-w-3xl">
        היתרות מוזנות פעם אחת, נכונות לתאריך החתך. כל שינוי נשמר מיד
        ונרשם ביומן הביקורת.
      </p>

      {cutoff ? (
        <div className="mb-5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-900 max-w-3xl">
          תאריך החתך: <b>{formatDate(cutoff)}</b> — היתרות שתזין צריכות
          לשקף את החוב נכון לתאריך זה. תנועות בנק מאוחרות ממנו ייספרו
          אוטומטית.
        </div>
      ) : (
        <div className="mb-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 max-w-3xl">
          ⚠️ <b>תאריך חתך לא הוגדר.</b> בלעדיו תשלום שכבר גולם ביתרה
          שתזין עלול להיספר פעם שנייה בקליטת דף החשבון.{" "}
          <Link href="/balances" className="underline font-medium">
            הגדר תאריך חתך במסך היתרות
          </Link>{" "}
          לפני ההזנה.
        </div>
      )}

      <OpeningBalancesTable rows={tableRows} />
    </div>
  );
}
