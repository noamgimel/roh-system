import { SignJWT, jwtVerify } from "jose";

// ניהול session בעוגייה חתומה (JWT, HS256) — עובד גם ב-Edge middleware.
// אין אחסון session בצד שרת: החתימה עם SESSION_SECRET היא מקור האמת.

export const SESSION_COOKIE = "roh_session";
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // שבוע
// עוגייה שנחתמה לפני יותר מיום מונפקת מחדש (הארכה מתגלגלת)
export const SESSION_RENEW_AFTER_SECONDS = 24 * 60 * 60;

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
}

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET חסר או קצר מ-32 תווים — הגדר אותו ב-.env.local"
    );
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ email: payload.email, name: payload.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

export interface VerifiedSession extends SessionPayload {
  issuedAt: number; // שניות אפוק — לחישוב הארכה מתגלגלת
}

/** מחזיר את פרטי ה-session או null אם הטוקן חסר/מזויף/פג. */
export async function verifySession(
  token: string | undefined
): Promise<VerifiedSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ["HS256"],
    });
    if (!payload.sub || typeof payload.email !== "string") return null;
    return {
      userId: payload.sub,
      email: payload.email,
      name: typeof payload.name === "string" ? payload.name : "",
      issuedAt: payload.iat ?? 0,
    };
  } catch {
    return null;
  }
}

export function shouldRenew(session: VerifiedSession, now = Date.now()): boolean {
  return now / 1000 - session.issuedAt > SESSION_RENEW_AFTER_SECONDS;
}
