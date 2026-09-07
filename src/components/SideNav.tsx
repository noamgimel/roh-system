"use client";

// תפריט הצד: הפריט של העמוד הנוכחי מסומן — רקע מלא + פס הדגשה
// בצד ימין (RTL) — לא רק hover.

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: string;
  label: string;
  badge?: number;
}

export default function SideNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 py-4">
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "block px-5 py-2.5 text-sm bg-slate-800 text-white font-medium border-r-4 border-blue-500"
                : "block px-5 py-2.5 text-sm text-slate-300 border-r-4 border-transparent hover:bg-slate-800 hover:text-white transition-colors"
            }
          >
            <span className="flex items-center justify-between">
              {item.label}
              {item.badge ? (
                <span className="text-[11px] font-bold bg-amber-400 text-slate-900 rounded-full px-2 py-0.5 leading-none">
                  {item.badge}
                </span>
              ) : null}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
