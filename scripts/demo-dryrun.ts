// הרצה יבשה של תסריט הדמו (לבדיקת הערכה, לא לשימוש בהקלטה):
//   npx tsx scripts/demo-dryrun.ts
import fs from "node:fs";
import postgres from "postgres";
import { parseClientsWorkbook } from "../src/lib/clients/excel";
import { importClients } from "../src/lib/clients/import";
import { parseBankCsv } from "../src/lib/bank/csv";
import { commitBankFile } from "../src/lib/bank/import";
import { runMatching, confirmMatch } from "../src/lib/match/engine";
import { approveTransaction, splitTransaction, approveAllMatched } from "../src/lib/match/queue";
import { runMonthlyCharges, getBalancesOverview } from "../src/lib/charges/engine";
import { DEMO_RATES } from "./make-demo";

async function main() {
  for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
  const sql = postgres(process.env.DATABASE_URL!, { max: 5, transform: postgres.camel });
  const log = (s: string) => console.log("•", s);
  try {
    // 1. ייבוא אקסל
    const parsed = await parseClientsWorkbook(fs.readFileSync("fixtures/demo-clients.xlsx"));
    const rep = await importClients(sql, parsed, { actor: "dryrun", fileName: "demo-clients.xlsx" });
    log(`ייבוא: נוצרו ${rep.created}, נכשלו ${rep.failed.length} (מצופה 12/1)`);

    // 2. תעריפים (בדמו: דרך טופס העריכה)
    for (const [name, rate] of Object.entries(DEMO_RATES)) {
      await sql`update clients set rate = ${rate} where name = ${name}`;
    }
    // 3. חיוב חודשי
    const charges = await runMonthlyCharges(sql, { actor: "dryrun" });
    log(`חיוב חודשי: נוצרו ${charges.created} (מצופה 6)`);

    // 4. דף חשבון 1
    const bank1 = parseBankCsv(fs.readFileSync("fixtures/demo-bank-1.csv"));
    const c1 = await commitBankFile(sql, bank1, { actor: "dryrun", fileName: "demo-bank-1.csv" });
    const m1 = await runMatching(sql, { actor: "dryrun" });
    log(`דף 1: חדשות ${c1.rowsNew}, מוחרגות ${c1.rowsIgnored} (מצופה 6/2) · הצעות ${m1.suggested} (מצופה 3), תור ${m1.queued} (מצופה 3)`);

    const sug = await sql`
      select t.parsed_payer_name, c.name from bank_transactions t
      join clients c on c.id = t.matched_client_id where t.status = 'needs_review'`;
    for (const s of sug) log(`  הצעה: ${s.parsedPayerName} ← ${s.name}`);

    // 5. שיוך שלוש ההצעות (לומד את חשבונות הבנק)
    for (const payer of ["אבי מזרחי", "מור לוי ושות", "דנה ברק"]) {
      const [t] = await sql`select id, matched_client_id from bank_transactions where parsed_payer_name = ${payer}`;
      await confirmMatch(sql, t.id as string, t.matchedClientId as string, "dryrun");
    }
    // 6. פיצול משפחת פרץ 3300 = 1800+1500
    const [peretz] = await sql`select id from bank_transactions where parsed_payer_name = 'משפחת פרץ'`;
    const [yossi] = await sql`select id from clients where name = 'יוסי פרץ'`;
    const [chen] = await sql`select id from clients where name = 'חן פרץ'`;
    await splitTransaction(sql, peretz.id as string, [
      { clientId: yossi.id as string, amount: 1800 },
      { clientId: chen.id as string, amount: 1500 },
    ], "dryrun");
    log("פיצול משפחת פרץ: 1800 ליוסי + 1500 לחן ✓");

    // 7. שיוך ידני של א.מ. אחזקות (לומד את המפתח 10-800-55555)
    const [am] = await sql`select id from bank_transactions where parsed_payer_name like 'א.מ.%'`;
    const [alon] = await sql`select id from clients where name = 'אלון מור אחזקות בע"מ'`;
    await confirmMatch(sql, am.id as string, alon.id as string, "dryrun");

    // 8. אשר את כל המותאמות
    const bulk = await approveAllMatched(sql, "dryrun");
    log(`אשר-הכול: ${bulk.approved} אושרו (מצופה 4)`);

    // 9. דף 1 שוב — הכול כבר טופל
    const again = await commitBankFile(sql, parseBankCsv(fs.readFileSync("fixtures/demo-bank-1.csv")), { actor: "dryrun", fileName: "demo-bank-1.csv" });
    log(`דף 1 שוב: חדשות ${again.rowsNew} (מצופה 0), כבר טופלו ${again.rowsDuplicate} (מצופה 8)`);

    // 10. דף 2 — הלמידה: הכול מזוהה אוטומטית ודאי
    const bank2 = parseBankCsv(fs.readFileSync("fixtures/demo-bank-2.csv"));
    await commitBankFile(sql, bank2, { actor: "dryrun", fileName: "demo-bank-2.csv" });
    const m2 = await runMatching(sql, { actor: "dryrun" });
    log(`דף 2: הותאמו אוטומטית ${m2.matchedExact} (מצופה 3!), הצעות ${m2.suggested}, תור ${m2.queued}`);
    const auto = await sql`
      select t.parsed_payer_name, c.name, t.match_confidence from bank_transactions t
      join clients c on c.id = t.matched_client_id where t.status = 'matched'`;
    for (const a of auto) log(`  אוטומטי (${a.matchConfidence}): "${a.parsedPayerName}" ← ${a.name}`);
    const bulk2 = await approveAllMatched(sql, "dryrun");
    log(`אשר-הכול שני: ${bulk2.approved}`);

    // 11. יתרות סופיות
    const overview = await getBalancesOverview(sql);
    for (const r of overview.filter((x) => Number(x.paidTotal) > 0 || Number(x.balance) !== 0)) {
      log(`יתרה: ${r.name} — חיובים ${r.chargesTotal}, שולם ${r.paidTotal}, יתרה ${r.balance}`);
    }
  } finally {
    await sql.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
