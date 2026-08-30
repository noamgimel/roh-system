import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/actor";
import SideNav from "@/components/SideNav";

const NAV = [
  { href: "/clients", label: "לקוחות" },
  { href: "/import", label: "ייבוא אקסל" },
  { href: "/bank", label: "קליטת דף חשבון" },
  { href: "/queue", label: "תור אישורים" },
  { href: "/balances", label: "יתרות" },
  { href: "/opening-balances", label: "יתרות פתיחה" },
  { href: "/audit", label: "יומן ביקורת" },
  { href: "/masking", label: "מיסוך נתונים (זמני)" },
];

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // ה-middleware כבר חוסם — זו הגנת עומק שנייה בלבד
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 shrink-0 bg-slate-900 text-slate-100 flex flex-col">
        <div className="px-5 py-6 border-b border-slate-700">
          <div className="text-lg font-bold">ניהול לקוחות ויתרות</div>
          <div className="text-xs text-slate-400 mt-1">משרד רו&quot;ח</div>
        </div>
        <SideNav items={NAV} />
        <div className="px-5 py-4 border-t border-slate-700">
          <div className="text-xs text-slate-400 mb-2 truncate" title={session.email}>
            מחובר: {session.name || session.email}
          </div>
          <form action="/api/auth/logout" method="post">
            <button className="text-xs text-slate-300 hover:text-white underline">
              התנתקות
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 p-8 max-w-6xl">{children}</main>
    </div>
  );
}
