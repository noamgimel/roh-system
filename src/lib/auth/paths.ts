// אילו נתיבים פתוחים בלי session. כל השאר — חסומים.
// מופרד לקובץ טהור כדי שה-middleware וגם הבדיקות ישתמשו באותה אמת.

const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth/login",
  // logout חייב לעבוד גם עם session פג — הוא רק מוחק עוגייה
  "/api/auth/logout",
  // מוגן בסוד משותף משלו (x-cron-secret) — לא בעוגיית session
  "/api/cron/",
  // נכסים סטטיים
  "/_next/",
  "/favicon.ico",
];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) =>
    p.endsWith("/")
      ? pathname.startsWith(p)
      : pathname === p || pathname.startsWith(p + "/")
  );
}
