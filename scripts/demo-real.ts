// ערכת דמו מהקבצים הממוסכים של הלקוח (לא מהדוגמה הבדויה):
//   npx tsx scripts/demo-real.ts [--rate 1500]
// קורא מ-~/Documents/roh-vault/masked/, כותב ל-~/Documents/roh-vault/masked/demo/:
//   clients-demo.xlsx  — עותק של הלקוחות הממוסכים + עמודת "תעריף" לדוגמה
//   bank-part1.xlsx / bank-part2.xlsx — דף החשבון מפוצל בתאריך שבו
//                        משלמים חוזרים בשני החלקים (כדי להדגים למידה)
// ומדפיס "דף עזר" עם המספרים שיופיעו בכל שלב של הדמו.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { parseBankXlsx, cellToText } from "../src/lib/bank/xlsx";
import { parsePayerDetails } from "../src/lib/bank/payerParse";
import { parseClientsWorkbook } from "../src/lib/clients/excel";
import { normalizeName } from "../src/lib/match/normalize";
import { mapBankHeaders } from "../src/lib/bank/csv";

const VAULT = path.join(os.homedir(), "Documents/roh-vault/masked");
const OUT = path.join(VAULT, "demo");

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
}

async function main() {
  const rate = Number(arg("--rate", "1500"));
  const clientsPath = fs.readdirSync(VAULT).filter((f) => /client/i.test(f) && f.endsWith(".xlsx")).map((f) => path.join(VAULT, f))[0];
  const bankPath = fs.readdirSync(VAULT).filter((f) => /bank/i.test(f) && f.endsWith(".xlsx")).map((f) => path.join(VAULT, f))[0];
  if (!clientsPath || !bankPath) throw new Error(`לא נמצאו קבצים ממוסכים ב-${VAULT} (צריך *client*.xlsx ו-*bank*.xlsx)`);
  fs.mkdirSync(OUT, { recursive: true });

  // ---- לקוחות: עותק + עמודת תעריף לדוגמה ----
  const cwb = new ExcelJS.Workbook();
  await cwb.xlsx.load(fs.readFileSync(clientsPath) as unknown as ArrayBuffer);
  const cws = cwb.worksheets[0];
  const parsedClients = await parseClientsWorkbook(fs.readFileSync(clientsPath));
  const headerRow = cws.getRow(parsedClients.headerRowNumber);
  const rateCol = (headerRow.cellCount || cws.columnCount) + 1;
  headerRow.getCell(rateCol).value = "תעריף";
  const statusCol = parsedClients.columns.find((c) => c.field === "is_active")?.index;
  const typeCol = parsedClients.columns.find((c) => c.field === "entity_type")?.index;
  let ratesSet = 0;
  for (const r of parsedClients.rows) {
    if (r.errors.length) continue;
    const row = cws.getRow(r.rowNumber);
    const status = statusCol ? cellToText(row.getCell(statusCol)) : "";
    const type = typeCol ? cellToText(row.getCell(typeCol)) : "";
    const inactive = /לא פעיל|עבר ל|נסגר/.test(status) || /לא פעיל/.test(type);
    if (!inactive) { row.getCell(rateCol).value = rate; ratesSet++; }
  }
  const clientsOut = path.join(OUT, "clients-demo.xlsx");
  fs.writeFileSync(clientsOut, Buffer.from(await cwb.xlsx.writeBuffer()));

  // ---- בנק: פיצול לשני חלקים ----
  const bank = await parseBankXlsx(fs.readFileSync(bankPath));
  const rows = bank.rows.map((r) => ({ ...r, payer: parsePayerDetails(r.details) }));
  const dates = [...new Set(rows.map((r) => r.txnDate))].sort();
  // בוחרים תאריך פיצול שממקסם משלמים (לפי מספר חשבון) שמופיעים בשני החלקים,
  // ומעדיף חלוקה מאוזנת
  let best = { date: dates[Math.floor(dates.length / 2)], recurring: [] as string[], score: -1 };
  for (const d of dates.slice(0, -1)) {
    const p1 = rows.filter((r) => r.txnDate <= d);
    const p2 = rows.filter((r) => r.txnDate > d);
    const keys1 = new Set(p1.map((r) => r.payer?.payerAccount).filter(Boolean));
    const rec = [...new Set(p2.filter((r) => r.payer?.payerAccount && keys1.has(r.payer.payerAccount)).map((r) => r.payer!.payerName))];
    const balance = 1 - Math.abs(p1.length - p2.length) / rows.length;
    const score = rec.length * 10 + balance * 5;
    if (score > best.score) best = { date: d, recurring: rec, score };
  }

  const bwb = new ExcelJS.Workbook();
  await bwb.xlsx.load(fs.readFileSync(bankPath) as unknown as ArrayBuffer);
  const bws = bwb.worksheets[0];
  // איתור שורת הכותרות ועמודת התאריך
  let headerIdx = -1, dateCol = 1;
  for (let r = 1; r <= Math.min(bws.rowCount, 20); r++) {
    const cells: string[] = [];
    bws.getRow(r).eachCell({ includeEmpty: false }, (c, col) => { cells[col - 1] = cellToText(c); });
    const map = mapBankHeaders(cells.map((t) => t ?? ""));
    if (map.length >= 4) { headerIdx = r; dateCol = (map.find((m) => m.field === "txnDate")?.index ?? 0) + 1; break; }
  }
  const rowIso = (r: number) => {
    const t = cellToText(bws.getRow(r).getCell(dateCol));
    const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
  };
  async function writePart(name: string, keep: (iso: string) => boolean) {
    const out = new ExcelJS.Workbook();
    const ws = out.addWorksheet(bws.name, { views: [{ rightToLeft: true }] });
    let outRow = 1;
    for (let r = 1; r <= bws.rowCount; r++) {
      const iso = r > headerIdx ? rowIso(r) : null;
      if (r > headerIdx && iso && !keep(iso)) continue;
      const src = bws.getRow(r);
      const vals: ExcelJS.CellValue[] = [];
      for (let c = 1; c <= bws.columnCount; c++) {
        const v = src.getCell(c).value;
        vals[c] = v instanceof Date || typeof v === "number" || typeof v === "string" ? v : (v == null ? null : src.getCell(c).text);
      }
      ws.getRow(outRow++).values = vals;
    }
    for (let c = 1; c <= bws.columnCount; c++) ws.getColumn(c).width = 16;
    const p = path.join(OUT, name);
    fs.writeFileSync(p, Buffer.from(await out.xlsx.writeBuffer()));
    return p;
  }
  const part1 = await writePart("bank-part1.xlsx", (iso) => iso <= best.date);
  const part2 = await writePart("bank-part2.xlsx", (iso) => iso > best.date);

  // ---- דף עזר ----
  const p1 = rows.filter((r) => r.txnDate <= best.date);
  const p2 = rows.filter((r) => r.txnDate > best.date);
  const clientNames = new Set(parsedClients.rows.filter((r) => !r.errors.length).map((r) => normalizeName(r.data.name as string)));
  const nameHits = (rs: typeof rows) => rs.filter((r) => r.payer && clientNames.has(normalizeName(r.payer.payerName)));
  const valid = parsedClients.rows.filter((r) => !r.errors.length).length;
  const failed = parsedClients.rows.filter((r) => r.errors.length);

  console.log("נוצרו:");
  console.log("  " + clientsOut);
  console.log("  " + part1);
  console.log("  " + part2);
  console.log("\n===== דף עזר לדמו על הנתונים הממוסכים =====");
  console.log(`ייבוא לקוחות: ${valid} לקוחות · ${failed.length} ממתינים להשלמה (שורות ${failed.map((f) => f.rowNumber).join(", ")}) · תעריף לדוגמה ${rate} ₪ ל-${ratesSet} פעילים`);
  console.log(`חיוב חודשי: ייווצרו ${ratesSet} חיובים`);
  console.log(`דף חשבון 1 (עד ${best.date}): ${p1.length} תנועות זכות · הצעות לפי שם: ${nameHits(p1).length}`);
  for (const r of nameHits(p1)) console.log(`    הצעה: "${r.payer!.payerName}" ← ₪${r.credit}`);
  console.log(`  משלמים שחוזרים בחלק 2 (לאשר אותם בחלק 1 — אלה הלמידה): ${best.recurring.length}`);
  for (const n of best.recurring) console.log(`    • ${n}`);
  console.log(`דף חשבון 2 (מ-${best.date} והלאה): ${p2.length} תנועות זכות · יזוהו אוטומטית "ודאי": ${p2.filter((r) => r.payer && best.recurring.includes(r.payer.payerName)).length}`);
  console.log(`\nתאריך חתך מומלץ ל-demo:reset: ${dates[0] < "2026-08-10" ? "2026-07-31" : "2026-08-10"}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
