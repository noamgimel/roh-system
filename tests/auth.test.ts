import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Sql } from "postgres";
import { freshTestDb } from "./helpers/testDb";
import {
  signSession,
  verifySession,
  shouldRenew,
} from "@/lib/auth/session";
import {
  createUser,
  verifyLogin,
  recordLogout,
  MAX_FAILED_ATTEMPTS,
} from "@/lib/auth/service";
import { isPublicPath } from "@/lib/auth/paths";

let sql: Sql;

beforeAll(async () => {
  process.env.SESSION_SECRET =
    "test-secret-0123456789-0123456789-0123456789";
  sql = await freshTestDb();
});

afterAll(async () => {
  await sql.end();
});

describe("session", () => {
  it("חתימה ואימות עגולים", async () => {
    const token = await signSession({
      userId: "u1",
      email: "a@b.co",
      name: "בודק",
    });
    const s = await verifySession(token);
    expect(s?.userId).toBe("u1");
    expect(s?.email).toBe("a@b.co");
    expect(s?.name).toBe("בודק");
  });

  it("טוקן מזויף או חסר נדחה", async () => {
    const token = await signSession({ userId: "u1", email: "a@b.co", name: "" });
    expect(await verifySession(token.slice(0, -2) + "xx")).toBeNull();
    expect(await verifySession(undefined)).toBeNull();
    expect(await verifySession("not-a-jwt")).toBeNull();
  });

  it("הארכה מתגלגלת: רק אחרי יום", async () => {
    const token = await signSession({ userId: "u1", email: "a@b.co", name: "" });
    const s = (await verifySession(token))!;
    expect(shouldRenew(s)).toBe(false);
    const dayAndBit = Date.now() + 25 * 60 * 60 * 1000;
    expect(shouldRenew(s, dayAndBit)).toBe(true);
  });
});

describe("נתיבים ציבוריים", () => {
  it("login ,cron ונכסים סטטיים פתוחים; כל השאר חסום", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/api/auth/login")).toBe(true);
    expect(isPublicPath("/api/auth/logout")).toBe(true);
    expect(isPublicPath("/api/cron/monthly-charges")).toBe(true);
    expect(isPublicPath("/_next/static/x.js")).toBe(true);

    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/clients")).toBe(false);
    expect(isPublicPath("/api/bank/commit")).toBe(false);
    expect(isPublicPath("/api/clients/export")).toBe(false);
    expect(isPublicPath("/loginX")).toBe(false);
  });
});

describe("שירות ההזדהות", () => {
  it("יצירת משתמש: אימייל מנורמל, סיסמה לא נשמרת גלויה, רישום ביומן", async () => {
    const user = await createUser(
      sql,
      { email: " Idan@Office.CO.IL ", name: "עידן", password: "sisma-arukha-1" },
      "test"
    );
    expect(user.email).toBe("idan@office.co.il");

    const [row] = await sql`select password_hash from users`;
    expect(row.passwordHash).not.toContain("sisma");

    const audit = await sql`select * from audit_log where action = 'user_create'`;
    expect(audit).toHaveLength(1);
  });

  it("סיסמה קצרה מדי נדחית", async () => {
    await expect(
      createUser(sql, { email: "x@y.co", name: "x", password: "קצרה" }, "test")
    ).rejects.toThrow("10 תווים");
  });

  it("התחברות תקינה: מחזירה משתמש, מעדכנת last_login_at, נרשמת ביומן", async () => {
    const result = await verifyLogin(sql, {
      email: "idan@office.co.il",
      password: "sisma-arukha-1",
      ip: "10.0.0.1",
    });
    expect(result.ok).toBe(true);

    const [u] = await sql`select last_login_at from users`;
    expect(u.lastLoginAt).toBeTruthy();

    const audit = await sql`select * from audit_log where action = 'login_success'`;
    expect(audit).toHaveLength(1);
    expect(String(audit[0].ip)).toBe("10.0.0.1");
  });

  it("סיסמה שגויה: אותה שגיאה גנרית + רישום כישלון", async () => {
    const result = await verifyLogin(sql, {
      email: "idan@office.co.il",
      password: "wrong-password",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("אימייל או סיסמה שגויים");

    const audit = await sql`select * from audit_log where action = 'login_failure'`;
    expect(audit).toHaveLength(1);
  });

  it("אימייל לא קיים מחזיר את אותה שגיאה בדיוק (אין דליפת מידע)", async () => {
    const result = await verifyLogin(sql, {
      email: "nobody@nowhere.co",
      password: "whatever-123",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("אימייל או סיסמה שגויים");
  });

  it(`נעילה אחרי ${MAX_FAILED_ATTEMPTS} כשלונות — גם עם הסיסמה הנכונה`, async () => {
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
      await verifyLogin(sql, {
        email: "idan@office.co.il",
        password: "wrong-" + i,
      });
    }
    const result = await verifyLogin(sql, {
      email: "idan@office.co.il",
      password: "sisma-arukha-1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.locked).toBe(true);
  });

  it("משתמש לא פעיל נדחה", async () => {
    await createUser(
      sql,
      { email: "old@office.co", name: "ישן", password: "sisma-arukha-2" },
      "test"
    );
    await sql`update users set is_active = false where email = 'old@office.co'`;
    const result = await verifyLogin(sql, {
      email: "old@office.co",
      password: "sisma-arukha-2",
    });
    expect(result.ok).toBe(false);
  });

  it("התנתקות נרשמת ביומן", async () => {
    await recordLogout(sql, "idan@office.co.il", "10.0.0.1");
    const audit = await sql`select * from audit_log where action = 'logout'`;
    expect(audit).toHaveLength(1);
  });
});
