import Link from "next/link";

/** כפתור חזרה אחיד לראש כל מסך פנימי */
export default function BackLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-3"
    >
      {/* ב-RTL חץ החזרה מצביע ימינה — לכיוון תחילת הקריאה */}
      <span aria-hidden>›</span>
      <span>חזרה ל{label}</span>
    </Link>
  );
}
