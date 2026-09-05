// כיול ייבוא הלקוחות על קובץ ממוסך:
//   npx tsx scripts/calibrate-clients.ts <masked-clients.xlsx>
// מדפיס: מיפוי כותרות, ספירות, סיבות כישלון, התפלגויות שדות.
// מיועד לקובץ ממוסך בלבד.
import fs from "node:fs";
import { parseClientsWorkbook } from "../src/lib/clients/excel";

function hist(values: unknown[]): string {
  const m = new Map<string, number>();
  for (const v of values) {
    const k = v === null || v === undefined || v === "" ? "(ריק)" : String(v);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([k, n]) => `${k}: ${n}`)
    .join(" · ");
}

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error("נתיב לקובץ ממוסך נדרש");
  const parsed = await parseClientsWorkbook(fs.readFileSync(path));

  console.log(`שורת כותרות: ${parsed.headerRowNumber}`);
  console.log("מיפוי עמודות:");
  for (const c of parsed.columns) {
    console.log(`  [${c.index}] ${c.header} ← ${c.field ?? "❌ לא ממופה"}`);
  }
  const valid = parsed.rows.filter((r) => r.errors.length === 0);
  const failed = parsed.rows.filter((r) => r.errors.length > 0);
  console.log(`\nשורות: ${parsed.rows.length} · תקינות: ${valid.length} · שגויות: ${failed.length}`);
  console.log("סיבות כישלון:", hist(failed.flatMap((r) => r.errors.map((e) => e.replace(/"[^"]*"/g, '"…"')))));
  for (const r of failed.slice(0, 6)) {
    console.log(`  שורה ${r.rowNumber}: ${r.errors.join("; ")} — שם="${r.data.name ?? ""}"`);
  }

  const d = (f: string) => valid.map((r) => (r.data as Record<string, unknown>)[f]);
  console.log("\nסוג ישות:", hist(d("entity_type")));
  console.log("סטטוס→פעיל:", hist(d("is_active")));
  console.log("תדירות מע\"מ:", hist(d("vat_frequency")));
  console.log("102 ב\"ל:", hist(d("ni_102_frequency")));
  console.log("102 מ\"ה:", hist(d("tax_102_frequency")));
  console.log("מקדמות (תדירות):", hist(d("advances_frequency")));
  console.log("מקדמות (שיעור):", hist(d("advances_rate")));
  console.log("הרשאות:", hist(d("permissions")));
  console.log("טלפון קיים:", valid.filter((r) => r.data.phone).length, "/", valid.length);
  console.log("בן/בת זוג קיים:", valid.filter((r) => r.data.spouse_name).length);
  console.log("ת\"ז בן/בת זוג קיים:", valid.filter((r) => r.data.spouse_tax_id).length);
  console.log("תיק ניכויים קיים:", valid.filter((r) => r.data.withholding_file).length);
  console.log("אורכי ת\"ז מקוריים (לפני ריפוד) — לפי מספר לקוח:", hist(d("client_no").map((v) => (v === null ? "ריק" : "יש"))));

  // ערכי הסטטוס הגולמיים — לכיול normalizeIsActive
  const statusCol = parsed.columns.find((c) => c.field === "is_active");
  if (statusCol) {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(fs.readFileSync(path) as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    const raw: string[] = [];
    for (let r = parsed.headerRowNumber + 1; r <= ws.rowCount; r++) {
      const t = ws.getRow(r).getCell(statusCol.index).text?.trim();
      if (t) raw.push(t);
    }
    console.log("\nערכי 'סטטוס' גולמיים:", hist(raw));
  }
  console.log("\nכותרות לא ממופות:", parsed.unmappedHeaders.join(" | ") || "אין");
}

main().catch((e) => { console.error(e.message); process.exit(1); });
