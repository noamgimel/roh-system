// הצינור המלא על הקבצים הממוסכים, מול DB הבדיקות (לא נוגע ב-DB הפיתוח):
//   npx tsx scripts/calibrate-pipeline.ts <masked-clients.xlsx> <masked-bank.xlsx>
// ייבוא לקוחות → קליטת בנק → מנוע התאמה → פילוח התוצאות.
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { migrate } from "../src/lib/migrate";
import { parseClientsWorkbook } from "../src/lib/clients/excel";
import { importClients } from "../src/lib/clients/import";
import { parseBankFile } from "../src/lib/bank/xlsx";
import { commitBankFile } from "../src/lib/bank/import";
import { runMatching } from "../src/lib/match/engine";

const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgres://roh:roh@localhost:54330/roh_test";

async function main() {
  const [clientsPath, bankPath] = process.argv.slice(2);
  if (!clientsPath || !bankPath) throw new Error("נדרשים שני נתיבים: לקוחות ממוסך, בנק ממוסך");

  const sql = postgres(TEST_DB, { max: 5, transform: postgres.camel, onnotice: () => {} });
  try {
    await sql.unsafe("drop schema public cascade; create schema public;");
    await migrate(sql);
    await sql`insert into app_settings (key, value) values ('balance_cutoff_date', '2026-07-31')`;

    const clients = await parseClientsWorkbook(fs.readFileSync(clientsPath));
    const cRep = await importClients(sql, clients, { actor: "calib", fileName: "clients" });
    console.log(`לקוחות: נוצרו ${cRep.created}, נכשלו ${cRep.failed.length}`);

    const bank = await parseBankFile(fs.readFileSync(bankPath), path.basename(bankPath));
    const bRep = await commitBankFile(sql, bank, { actor: "calib", fileName: "bank" });
    console.log(`בנק: חדשות ${bRep.rowsNew}, מוחרגות ${bRep.rowsIgnored}, כפולות ${bRep.rowsDuplicate}`);

    const m = await runMatching(sql, { actor: "calib" });
    console.log(`\nמנוע ההתאמה (יום ראשון, טבלת כינויים ריקה): הוערכו ${m.evaluated} · ודאי-אוטומטי ${m.matchedExact} · הצעות ${m.suggested} · תור ידני ${m.queued}`);

    const rows = await sql`
      select t.txn_date, t.credit, t.parsed_payer_name, t.parsed_payer_tax_id, t.parsed_bank_key,
             t.status, t.match_confidence, t.match_reason, c.name as client_name
      from bank_transactions t left join clients c on c.id = t.matched_client_id
      where t.status <> 'ignored'
      order by t.match_confidence nulls last, t.txn_date
    `;
    const byReason = new Map<string, number>();
    for (const r of rows) {
      const k = `${r.matchConfidence ?? "—"} · ${r.matchReason ?? ""}`;
      byReason.set(k, (byReason.get(k) ?? 0) + 1);
    }
    console.log("\nפילוח לפי כלל:");
    for (const [k, n] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${n.toString().padStart(3)}  ${k}`);

    console.log("\nתנועות בתור הידני (ללא הצעה):");
    for (const r of rows.filter((r) => !r.clientName)) {
      console.log(`  ${r.txnDate.toISOString().slice(0, 10)}  ₪${String(r.credit).padStart(9)}  משלם="${r.parsedPayerName ?? "—"}"  ת"ז=${r.parsedPayerTaxId ?? "—"}  key=${r.parsedBankKey ?? "—"}`);
    }
    console.log("\nדוגמאות התאמה:");
    for (const r of rows.filter((r) => r.clientName).slice(0, 8)) {
      console.log(`  ${r.matchConfidence}  "${r.parsedPayerName}" ← ${r.clientName}`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
