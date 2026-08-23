import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { recordLogout } from "@/lib/auth/service";
import { verifySession, SESSION_COOKIE } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) {
    await recordLogout(
      sql,
      session.email,
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? undefined
    );
  }
  const res = NextResponse.redirect(new URL("/login", req.url), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
