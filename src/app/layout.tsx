import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const heebo = Heebo({ subsets: ["hebrew", "latin"] });

export const metadata: Metadata = {
  title: "מערכת ניהול לקוחות ויתרות",
  description: "ניהול לקוחות, יתרות והנפקת מסמכים — משרד רו\"ח",
};

const NAV = [
  { href: "/clients", label: "לקוחות" },
  { href: "/import", label: "ייבוא אקסל" },
  { href: "/bank", label: "קליטת דף חשבון" },
  { href: "/queue", label: "תור אישורים", disabled: true },
  { href: "/balances", label: "יתרות" },
  { href: "/documents", label: "מסמכים", disabled: true },
  { href: "/audit", label: "יומן ביקורת", disabled: true },
];

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl">
      <body className={`${heebo.className} bg-slate-50 text-slate-900 antialiased`}>
        <div className="min-h-screen flex">
          <aside className="w-56 shrink-0 bg-slate-900 text-slate-100 flex flex-col">
            <div className="px-5 py-6 border-b border-slate-700">
              <div className="text-lg font-bold">ניהול לקוחות ויתרות</div>
              <div className="text-xs text-slate-400 mt-1">משרד רו&quot;ח</div>
            </div>
            <nav className="flex-1 py-4">
              {NAV.map((item) =>
                item.disabled ? (
                  <span
                    key={item.href}
                    className="block px-5 py-2.5 text-sm text-slate-500 cursor-default select-none"
                    title="בשלב הבא"
                  >
                    {item.label}
                  </span>
                ) : (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="block px-5 py-2.5 text-sm hover:bg-slate-800 transition-colors"
                  >
                    {item.label}
                  </Link>
                )
              )}
            </nav>
            <div className="px-5 py-4 text-[11px] text-slate-500 border-t border-slate-700">
              סביבת פיתוח — נתונים ממוסכים בלבד
            </div>
          </aside>
          <main className="flex-1 p-8 max-w-6xl">{children}</main>
        </div>
      </body>
    </html>
  );
}
