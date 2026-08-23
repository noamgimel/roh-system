import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { verifyLogin } from "@/lib/auth/service";
import {
  signSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth/session";

function clientIp(req: NextRequest): string | undefined {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    undefined
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { email, password } = body;
    if (typeof email !== "string" || typeof password !== "string") {
      return NextResponse.json(
        { error: "אימייל וסיסמה הם שדות חובה" },
        { status: 400 }
      );
    }

    const result = await verifyLogin(sql, {
      email,
      password,
      ip: clientIp(req),
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.locked ? 429 : 401 }
      );
    }

    const token = await signSession({
      userId: result.user.id,
      email: result.user.email,
      name: result.user.name,
    });

    const res = NextResponse.json({
      data: { name: result.user.name, email: result.user.email },
    });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_MAX_AGE_SECONDS,
      path: "/",
    });
    return res;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "שגיאה בהתחברות" },
      { status: 500 }
    );
  }
}
