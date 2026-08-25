// איפוס לדמו/חזרה: מוחק את כל הנתונים העסקיים, משאיר את המשתמשים,
// ומגדיר תאריך חתך 10/08/2026 (תואם את קובצי הדמו).
//   npm run demo:reset
// ⚠️ מיועד לסביבת פיתוח מקומית בלבד.
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

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
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes("localhost")) {
    console.error("איפוס דמו מותר רק מול DB מקומי (localhost) — נעצר.");
    process.exit(1);
  }
  const sql = postgres(url, { max: 1 });
  try {
    await sql`
      truncate table
        transaction_allocations, credit_notes, documents,
        bank_transactions, import_batches,
        payer_clients, payers,
        charges, clients, audit_log
      restart identity cascade
    `;
    await sql`
      insert into app_settings (key, value, updated_at)
      values ('balance_cutoff_date', '2026-08-10', now())
      on conflict (key) do update set value = '2026-08-10', updated_at = now()
    `;
    console.log("הדאטה אופס. המשתמשים נשמרו. תאריך חתך: 2026-08-10.");
    console.log("מוכן לדמו — התחל מייבוא fixtures/demo-clients.xlsx");
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
