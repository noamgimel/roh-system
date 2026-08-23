import { cookies } from "next/headers";
import { verifySession, SESSION_COOKIE, type VerifiedSession } from "./session";

/** ה-session הנוכחי בצד השרת, או null אם אין. */
export async function getSession(): Promise<VerifiedSession | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

/**
 * זהות המבצע לרישום ביומן הביקורת ולפעולות כתיבה.
 * ה-middleware כבר חוסם גישה בלי session — אם הגענו לכאן בלעדיו,
 * זו שגיאה ולא מצב לגיטימי.
 */
export async function getActor(): Promise<string> {
  const session = await getSession();
  if (!session) throw new Error("אין session פעיל — נדרשת התחברות");
  return session.email;
}
