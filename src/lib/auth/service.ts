import bcrypt from "bcryptjs";
import type { Sql } from "postgres";
import { writeAudit } from "@/lib/audit";

// שירות ההזדהות: אימות סיסמה, נעילה נגד ניסיונות כושלים, ותיעוד
// כל התחברות (מוצלחת וכושלת) ביומן הביקורת — דרישת ההסכם.

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_WINDOW_MINUTES = 15;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export async function createUser(
  sql: Sql,
  input: { email: string; name: string; password: string },
  actor: string
): Promise<AuthUser> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("כתובת אימייל לא תקינה");
  }
  if (input.password.length < 10) {
    throw new Error("סיסמה חייבת להיות באורך 10 תווים לפחות");
  }
  const hash = await bcrypt.hash(input.password, 12);
  return sql.begin(async (tx) => {
    const [user] = await tx`
      insert into users (email, name, password_hash)
      values (${email}, ${input.name}, ${hash})
      returning id, email, name, role
    `;
    await writeAudit(tx, {
      actor,
      action: "user_create",
      entity: "users",
      entityId: user.id as string,
      after: { email, name: input.name },
    });
    return user as unknown as AuthUser;
  });
}

/** כמה כשלונות התחברות היו לאימייל/IP בחלון הנעילה. */
async function recentFailures(
  sql: Sql,
  email: string,
  ip: string | undefined
): Promise<number> {
  const [row] = await sql`
    select count(*)::int as count from audit_log
    where action = 'login_failure'
      and created_at > now() - make_interval(mins => ${LOCKOUT_WINDOW_MINUTES})
      and (entity_id = ${email} ${ip ? sql`or ip = ${ip}` : sql``})
  `;
  return row.count as number;
}

export type LoginResult =
  | { ok: true; user: AuthUser }
  | { ok: false; error: string; locked?: boolean };

/**
 * אימות התחברות. לעולם לא מבדיל בין "אימייל לא קיים" ל"סיסמה שגויה"
 * כלפי חוץ; כן מבדיל נעילה (כדי שהמשתמש יבין למה לחכות).
 */
export async function verifyLogin(
  sql: Sql,
  input: { email: string; password: string; ip?: string }
): Promise<LoginResult> {
  const email = input.email.trim().toLowerCase();

  const failures = await recentFailures(sql, email, input.ip);
  if (failures >= MAX_FAILED_ATTEMPTS) {
    return {
      ok: false,
      locked: true,
      error: `יותר מדי ניסיונות כושלים — נסה שוב בעוד ${LOCKOUT_WINDOW_MINUTES} דקות`,
    };
  }

  const [user] = await sql`
    select id, email, name, role, password_hash, is_active
    from users where email = ${email}
  `;

  const valid =
    user &&
    user.isActive &&
    (await bcrypt.compare(input.password, user.passwordHash as string));

  if (!valid) {
    await writeAudit(sql, {
      actor: email,
      action: "login_failure",
      entity: "users",
      entityId: email,
      ip: input.ip,
    });
    return { ok: false, error: "אימייל או סיסמה שגויים" };
  }

  await sql`update users set last_login_at = now() where id = ${user.id as string}`;
  await writeAudit(sql, {
    actor: email,
    action: "login_success",
    entity: "users",
    entityId: user.id as string,
    ip: input.ip,
  });
  return {
    ok: true,
    user: {
      id: user.id as string,
      email: user.email as string,
      name: user.name as string,
      role: user.role as string,
    },
  };
}

export async function recordLogout(sql: Sql, email: string, ip?: string) {
  await writeAudit(sql, {
    actor: email,
    action: "logout",
    entity: "users",
    entityId: email,
    ip,
  });
}
