// יצירת משתמש המערכת (משתמש יחיד בשלב א'):
//   ROH_USER_PASSWORD='<סיסמה>' npm run create-user -- <email> "<שם>"
// אם לא סופקה סיסמה — נוצרת סיסמה אקראית ומודפסת פעם אחת.
// סיסמאות לעולם לא נשמרות בקוד או בריפו.
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { createUser } from "../src/lib/auth/service";

function loadEnvLocal() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

async function main() {
  loadEnvLocal();
  const [email, name] = process.argv.slice(2);
  if (!email || !name) {
    console.error('שימוש: npm run create-user -- <email> "<שם מלא>"');
    process.exit(1);
  }
  const generated = !process.env.ROH_USER_PASSWORD;
  const password =
    process.env.ROH_USER_PASSWORD ?? randomBytes(12).toString("base64url");

  const sql = postgres(process.env.DATABASE_URL!, {
    max: 1,
    transform: postgres.camel,
  });
  try {
    const user = await createUser(sql, { email, name, password }, "cli");
    console.log(`נוצר משתמש: ${user.email} (${user.name})`);
    if (generated) {
      console.log(`סיסמה (חד-פעמית, שמור אותה עכשיו): ${password}`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
