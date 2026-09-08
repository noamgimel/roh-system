// חזרה אוטומטית של דמו הנתונים הממוסכים, מול DB הבדיקות:
//   npx tsx scripts/demo-real-dryrun.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import postgres from "postgres";
import { migrate } from "../src/lib/migrate";
import { parseClientsWorkbook } from "../src/lib/clients/excel";
import { importClients } from "../src/lib/clients/import";
import { listPending } from "../src/lib/clients/pending";
import { parseBankFile } from "../src/lib/bank/xlsx";
import { commitBankFile } from "../src/lib/bank/import";
import { runMatching, confirmMatch } from "../src/lib/match/engine";
import { approveAllMatched } from "../src/lib/match/queue";
import { runMonthlyCharges, getBalancesOverview } from "../src/lib/charges/engine";

const DEMO = path.join(os.homedir(), "Documents/roh-vault/masked/demo");
const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgres://roh:roh@localhost:54330/roh_test";
const log = (s: string) => console.log("•", s);

async function main() {
  const sql = postgres(TEST_DB, { max: 5, transform: postgres.camel, onnotice: () => {} });
  try {
    await sql.unsafe("drop schema public cascade; create schema public;");
    await migrate(sql);
    await sql`insert into app_settings (key, value) values ('balance_cutoff_date', '2026-07-31')`;

    const c = await importClients(sql, await parseClientsWorkbook(fs.readFileSync(path.join(DEMO, "clients-demo.xlsx"))), { actor: "demo", fileName: "clients-demo.xlsx" });
    log(`ייבוא: ${c.created} נוצרו · ${c.pendingSaved} ממתינים (${(await listPending(sql)).map((p) => `שורה ${p.rowNumber}`).join(", ")})`);
    const withRate = await sql`select count(*)::int as n from clients where rate is not null`;
    log(`תעריפים נקלטו: ${withRate[0].n}`);

    const ch = await runMonthlyCharges(sql, { actor: "demo" });
    log(`חיוב חודשי: ${ch.created} חיובים`);

    const b1 = await commitBankFile(sql, await parseBankFile(fs.readFileSync(path.join(DEMO, "bank-part1.xlsx")), "bank-part1.xlsx"), { actor: "demo", fileName: "bank-part1.xlsx" });
    const m1 = await runMatching(sql, { actor: "demo" });
    log(`דף 1: ${b1.rowsNew} חדשות · ${b1.rowsIgnored} מוחרגות · הצעות ${m1.suggested} · תור ${m1.queued}`);
    const sug = await sql`select t.parsed_payer_name as p, c.name from bank_transactions t join clients c on c.id = t.matched_client_id where t.status = 'needs_review'`;
    for (const s of sug) log(`    הצעה: "${s.p}" ← ${s.name}`);

    // מאשרים: ההצעות + שלושת החוזרים (משייכים אותם ללקוח כלשהו לצורך הדגמת הלמידה)
    for (const s of await sql`select id, matched_client_id as cid from bank_transactions where status = 'needs_review' and matched_client_id is not null`) {
      await confirmMatch(sql, s.id as string, s.cid as string, "demo");
    }
    const anyClient = (await sql`select id from clients where is_active order by name limit 3`).map((r) => r.id as string);
    const recurring = ["ורד נאמן", "אסתר זיו", "דורון פלד"];
    let i = 0;
    for (const name of recurring) {
      const [t] = await sql`select id from bank_transactions where parsed_payer_name = ${name} and status in ('new','needs_review') order by txn_date limit 1`;
      if (t) { await confirmMatch(sql, t.id as string, anyClient[i++ % anyClient.length], "demo"); log(`    שויך ידנית (למידה): "${name}"`); }
    }
    const a1 = await approveAllMatched(sql, "demo");
    log(`אשר הכול: ${a1.approved}`);

    const b2 = await commitBankFile(sql, await parseBankFile(fs.readFileSync(path.join(DEMO, "bank-part2.xlsx")), "bank-part2.xlsx"), { actor: "demo", fileName: "bank-part2.xlsx" });
    const m2 = await runMatching(sql, { actor: "demo" });
    log(`דף 2: ${b2.rowsNew} חדשות · ודאי-אוטומטי ${m2.matchedExact} · הצעות ${m2.suggested} · תור ${m2.queued}`);
    for (const r of await sql`select t.parsed_payer_name as p, c.name, t.match_reason as why from bank_transactions t join clients c on c.id = t.matched_client_id where t.status = 'matched'`) {
      log(`    ודאי: "${r.p}" ← ${r.name} (${r.why})`);
    }
    const a2 = await approveAllMatched(sql, "demo");
    log(`אשר הכול (2): ${a2.approved}`);

    const ov = await getBalancesOverview(sql);
    const partial = ov.filter((r) => Number(r.paidTotal) > 0 && Number(r.balance) > 0);
    log(`יתרות: ${ov.length} לקוחות פעילים · שילמו משהו: ${ov.filter((r) => Number(r.paidTotal) > 0).length} · חלקי (שילמו ונשאר חוב): ${partial.length}`);
    for (const r of partial.slice(0, 3)) log(`    ${r.name}: חיוב ${r.chargesTotal}, שולם ${r.paidTotal}, יתרה ${r.balance}`);
  } finally {
    await sql.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
