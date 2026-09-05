// דוח "צורה" של קובץ xlsx — בלי תוכן. מדפיס כותרות, סוגי תאים ותבניות
// שבהן כל אות עברית ← "א", אות לטינית ← "x", ספרה ← "9". פיסוק ורווחים
// נשמרים. נועד לאבחון פורמט של קבצים שעלולים להכיל נתונים אמיתיים,
// בלי שפרט מזהה אחד ייחשף.
//   npx tsx scripts/shape-report.ts <path.xlsx> [maxRows]
import fs from "node:fs";
import ExcelJS from "exceljs";

function shape(s: string): string {
  return s
    .replace(/[א-ת]/g, "א")
    .replace(/[A-Za-z]/g, "x")
    .replace(/\d/g, "9");
}

function cellKind(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "empty";
  if (v instanceof Date) return "date";
  if (typeof v === "number") return "number";
  if (typeof v === "string") return "text";
  if (typeof v === "object" && "result" in v) return "formula";
  if (typeof v === "object" && "richText" in v) return "richtext";
  return typeof v;
}

async function main() {
  const [path, maxRowsArg] = process.argv.slice(2);
  if (!path) {
    console.error("שימוש: npx tsx scripts/shape-report.ts <קובץ.xlsx> [maxRows]");
    process.exit(1);
  }
  const maxRows = Number(maxRowsArg) || 8;
  const buf = fs.readFileSync(path);
  const sig = buf.subarray(0, 4).toString("hex");
  console.log(`חתימת קובץ: ${sig} (${sig === "504b0304" ? "zip/xlsx רגיל" : sig === "d0cf11e0" ? "OLE — כנראה xlsx מוצפן בסיסמה" : "לא מזוהה"})`);
  if (sig !== "504b0304") return;

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  console.log(`גיליונות: ${wb.worksheets.length}`);
  for (const ws of wb.worksheets) {
    console.log(`\n=== גיליון "${shape(ws.name)}" — ${ws.rowCount} שורות × ${ws.columnCount} עמודות ===`);
    const limit = Math.min(ws.rowCount, maxRows);
    for (let r = 1; r <= limit; r++) {
      const row = ws.getRow(r);
      const parts: string[] = [];
      for (let c = 1; c <= ws.columnCount; c++) {
        const cell = row.getCell(c);
        const kind = cellKind(cell.value);
        const text = cell.text ?? "";
        parts.push(kind === "empty" ? "·" : `[${kind}] ${shape(text).slice(0, 60)}`);
      }
      console.log(`שורה ${r}: ${parts.join(" | ")}`);
    }
    // סטטיסטיקה: כמה שורות מכילות תבנית "המבצע"/"עבור" ומפתח בנק-סניף-חשבון
    let withOperator = 0, withFor = 0, withKey = 0, dataRows = 0;
    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      let text = "";
      row.eachCell({ includeEmpty: false }, (cell) => { text += " " + (cell.text ?? ""); });
      if (!text.trim()) continue;
      dataRows++;
      if (/המבצע/.test(text)) withOperator++;
      if (/עבור/.test(text)) withFor++;
      if (/\d{1,2}-\d{1,3}-\d{4,10}/.test(text)) withKey++;
    }
    console.log(`\nשורות עם תוכן: ${dataRows} · מכילות "המבצע": ${withOperator} · מכילות "עבור": ${withFor} · מכילות מפתח בנק-סניף-חשבון: ${withKey}`);
    // כותרות ייחודיות (טקסט מלא — כותרות אינן מידע אישי)
    const headers = new Set<string>();
    for (let r = 1; r <= Math.min(ws.rowCount, 10); r++) {
      ws.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
        const t = (cell.text ?? "").trim();
        if (t && !/\d{3,}/.test(t) && t.length <= 25 && cellKind(cell.value) === "text") headers.add(t);
      });
    }
    console.log(`טקסטים קצרים בשורות 1-10 (מועמדים לכותרות): ${[...headers].join(" | ")}`);
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
