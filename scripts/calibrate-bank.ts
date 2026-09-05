// כיול קליטת הבנק על קובץ ממוסך:
//   npx tsx scripts/calibrate-bank.ts <masked-bank.xlsx|csv>
// מדפיס: פענוח, סינון, כיסוי פרסר המשלם, תבניות "פרטים", סוגי פעולה,
// פגיעת כללי ההחרגה. לקובץ ממוסך בלבד.
import fs from "node:fs";
import path from "node:path";
import { parseBankFile } from "../src/lib/bank/xlsx";
import { parsePayerDetails } from "../src/lib/bank/payerParse";
import { autoExclusionReason } from "../src/lib/bank/rules";

function hist(values: (string | null | undefined)[], top = 15): string {
  const m = new Map<string, number>();
  for (const v of values) m.set(v || "(ריק)", (m.get(v || "(ריק)") ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, top)
    .map(([k, n]) => `${k}: ${n}`).join(" · ");
}

/** תבנית של טקסט: מילים עבריות ← א, ספרות ← 9 — לזיהוי מבנים חוזרים */
function pattern(s: string): string {
  return s.replace(/[א-ת]+/g, "א").replace(/\d+/g, "9").replace(/\s+/g, " ").trim();
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("נתיב לקובץ ממוסך נדרש");
  const parsed = await parseBankFile(fs.readFileSync(file), path.basename(file));

  console.log(`קידוד/פורמט: ${parsed.encoding} · שורת כותרות: ${parsed.headerRowNumber}`);
  console.log(`תנועות זכות: ${parsed.rows.length} · חובה סוננו: ${parsed.debitRowsFiltered} · דולגו: ${parsed.skippedRows.length} · כפולות בקובץ: ${parsed.duplicatesInFile}`);
  for (const s of parsed.skippedRows.slice(0, 5)) console.log(`  דולג: שורה ${s.rowNumber} — ${s.reason}`);
  if (parsed.rows.length) {
    const dates = parsed.rows.map((r) => r.txnDate).sort();
    console.log(`טווח: ${dates[0]} → ${dates[dates.length - 1]}`);
    console.log(`תאריך ערך קיים: ${parsed.rows.filter((r) => r.valueDate).length} · חשבון קיים: ${parsed.rows.filter((r) => r.account).length} · יתרה קיימת: ${parsed.rows.filter((r) => r.balanceAfter).length}`);
  }

  console.log("\nסוגי פעולה (תיאור):", hist(parsed.rows.map((r) => r.description)));

  // כיסוי הפרסר
  let withPayer = 0, withKey = 0, withId = 0, withPurpose = 0;
  const idInDetails = /(?<![\d-])\d{9}(?![\d-])/;
  const unparsed: string[] = [];
  const patterns: string[] = [];
  for (const r of parsed.rows) {
    const p = parsePayerDetails(r.details);
    if (p) { withPayer++; if (p.bankKey) withKey++; if (p.purpose) withPurpose++; }
    else unparsed.push(`${r.description ?? ""} | ${r.details ?? ""}`);
    if (r.details && idInDetails.test(r.details)) withId++;
    if (r.details) patterns.push(pattern(r.details));
  }
  const n = parsed.rows.length || 1;
  console.log(`\nפרסר המשלם: שם חולץ ב-${withPayer}/${parsed.rows.length} (${Math.round(withPayer / n * 100)}%) · bank_key ב-${withKey} · ת"ז בפרטים ב-${withId} · מטרה ב-${withPurpose}`);
  console.log("תבניות 'פרטים' נפוצות:", hist(patterns, 10));
  console.log(`\nשורות זכות ללא משלם (${unparsed.length}) — תיאור | פרטים:`);
  for (const u of unparsed.slice(0, 25)) console.log("  " + u.slice(0, 110));

  // החרגות
  const excluded = parsed.rows.map((r) => autoExclusionReason(r)).filter(Boolean) as string[];
  console.log(`\nהחרגה אוטומטית: ${excluded.length} —`, hist(excluded));

  // סכומים
  const credits = parsed.rows.map((r) => Number(r.credit));
  console.log(`\nסכומי זכות: מינימום ${Math.min(...credits)} · מקסימום ${Math.max(...credits)} · חציון ${credits.sort((a, b) => a - b)[Math.floor(credits.length / 2)]}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
