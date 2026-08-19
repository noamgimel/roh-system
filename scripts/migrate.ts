// הרצת מיגרציות מה-CLI: npm run db:migrate
// קורא את DATABASE_URL מ-.env.local (או מהסביבה).
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { migrate } from "../src/lib/migrate";

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
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL חסר — הגדר אותו ב-.env.local");
    process.exit(1);
  }
  const sql = postgres(url, { max: 1 });
  try {
    const ran = await migrate(sql);
    if (ran.length === 0) console.log("אין מיגרציות חדשות — הכול מעודכן");
    else console.log("הוחלו:", ran.join(", "));
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
