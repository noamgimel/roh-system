import { NextRequest, NextResponse } from "next/server";
import {
  verifySession,
  signSession,
  shouldRenew,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth/session";
import { isPublicPath } from "@/lib/auth/paths";

// שער הכניסה: כל מסך וכל API חסומים בלי session תקף.
// רץ ב-Edge — אין כאן גישה ל-DB, רק אימות חתימת העוגייה.

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const session = await verifySession(
    req.cookies.get(SESSION_COOKIE)?.value
  );

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "נדרשת התחברות" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  const res = NextResponse.next();
  // הארכה מתגלגלת: עוגייה מלפני יותר מיום מונפקת מחדש
  if (shouldRenew(session)) {
    res.cookies.set(SESSION_COOKIE, await signSession(session), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_MAX_AGE_SECONDS,
      path: "/",
    });
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
