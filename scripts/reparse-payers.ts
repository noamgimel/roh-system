// הרצה חוזרת של פרסר המשלם על תנועות שכבר נקלטו:
//   npm run reparse
// שימושי אחרי כיול הפרסר מול קובץ אמיתי — מעדכן רק תנועות שטרם
// הונפק להן מסמך (new / needs_review / ignored), לעולם לא נוגע
// בתנועות שהותאמו, אושרו או הונפקו.
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { parsePayerDetails } from "../src/lib/bank/payerParse";

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
  const sql = postgres(process.env.DATABASE_URL!, {
    max: 1,
    transform: postgres.camel,
  });
  try {
    const rows = await sql`
      select id, details from bank_transactions
      where status in ('new', 'needs_review', 'ignored')
    `;
    let changed = 0;
    for (const row of rows) {
      const parsed = parsePayerDetails(row.details as string | null);
      const updated = await sql`
        update bank_transactions
        set parsed_payer_name   = ${parsed?.payerName ?? null},
            parsed_bank_key     = ${parsed?.bankKey ?? null},
            parsed_payer_account = ${parsed?.payerAccount ?? null},
            parsed_purpose      = ${parsed?.purpose ?? null}
        where id = ${row.id as string}
          and (parsed_payer_name   is distinct from ${parsed?.payerName ?? null}
            or parsed_bank_key     is distinct from ${parsed?.bankKey ?? null}
            or parsed_payer_account is distinct from ${parsed?.payerAccount ?? null}
            or parsed_purpose      is distinct from ${parsed?.purpose ?? null})
        returning id
      `;
      if (updated.length > 0) changed++;
    }
    console.log(`נבדקו ${rows.length} תנועות, עודכנו ${changed}`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
