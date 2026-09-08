// בדיקת מוכנות לפני דמו חי: npm run demo:preflight
// מוודא שכל מה שהדמו תלוי בו עומד — ומדפיס מה לתקן אם לא.
import fs from "node:fs";
import { execSync } from "node:child_process";
import postgres from "postgres";

function loadEnvLocal() {
  const p = ".env.local";
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const ok: string[] = [];
const bad: string[] = [];
const check = (cond: boolean, good: string, fix: string) => (cond ? ok.push(good) : bad.push(fix));

async function main() {
  loadEnvLocal();

  // Docker + DB
  let dockerUp = false;
  try { execSync("docker info", { stdio: "ignore" }); dockerUp = true; } catch {}
  check(dockerUp, "Docker רץ", "Docker לא רץ → open -a Docker && npm run db:up");

  let dbUp = false, userCount = 0, cutoff: string | null = null, clientCount = 0;
  if (dockerUp && process.env.DATABASE_URL) {
    try {
      const sql = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 5 });
      const [u] = await sql`select count(*)::int as c from users where is_active`;
      userCount = u.c as number;
      const [s] = await sql`select value from app_settings where key = 'balance_cutoff_date'`;
      cutoff = (s?.value as string) ?? null;
      const [c] = await sql`select count(*)::int as c from clients`;
      clientCount = c.c as number;
      await sql.end();
      dbUp = true;
    } catch {}
  }
  check(dbUp, "בסיס הנתונים זמין", "DB לא זמין → npm run db:up && npm run db:migrate");
  check(userCount > 0, `משתמשים פעילים: ${userCount}`, "אין משתמש → npm run create-user -- <email> \"<שם>\"");
  check(!!cutoff, `תאריך חתך מוגדר: ${cutoff}`, "אין תאריך חתך → npm run demo:reset (מגדיר 10/08/2026)");
  if (dbUp) ok.push(clientCount === 0 ? "DB נקי (0 לקוחות) — מוכן להתחיל מייבוא" : `שים לב: ${clientCount} לקוחות כבר ב-DB — לדמו נקי הרץ npm run demo:reset`);

  // סודות
  for (const k of ["SESSION_SECRET", "CRON_SECRET", "MASKING_PEPPER"]) {
    check(!!process.env[k] && process.env[k]!.length >= 16, `${k} מוגדר`, `${k} חסר ב-.env.local`);
  }

  // קובצי הדמו
  for (const f of ["fixtures/demo-clients.xlsx", "fixtures/demo-bank-1.csv", "fixtures/demo-bank-2.csv"]) {
    check(fs.existsSync(f), `${f} קיים`, `${f} חסר → npm run demo:fixtures`);
  }

  // ערכת הדמו על הנתונים הממוסכים (אם קיימת)
  const demoDir = `${process.env.HOME}/Documents/roh-vault/masked/demo`;
  const realDemo = ["clients-demo.xlsx", "bank-part1.xlsx", "bank-part2.xlsx"].every((f) => fs.existsSync(`${demoDir}/${f}`));
  ok.push(realDemo ? "ערכת הדמו על הנתונים הממוסכים קיימת (~/Documents/roh-vault/masked/demo)" : "אין ערכת דמו ממוסכת — לדמו על נתוני עידן הרץ npm run demo:real");

  // build + שרת
  check(fs.existsSync(".next/BUILD_ID"), "build קיים", "אין build → npm run build");
  let serverUp = false;
  try {
    const res = await fetch("http://localhost:3000/login", { signal: AbortSignal.timeout(3000) });
    serverUp = res.status === 200;
  } catch {}
  check(serverUp, "השרת עונה על localhost:3000", "השרת לא רץ → npm start (או lsof -ti :3000 | xargs kill; npm start)");

  console.log("\n✅ תקין:");
  for (const s of ok) console.log("   " + s);
  if (bad.length) {
    console.log("\n❌ לתקן לפני הדמו:");
    for (const s of bad) console.log("   " + s);
    process.exit(1);
  }
  console.log("\n🎬 מוכן לדמו. לפני שמתחילים: npm run demo:reset, התחברות, ומסך לקוחות ריק.");
}

main().catch((e) => { console.error(e); process.exit(1); });
