import { createHash } from "node:crypto";

// פענוח קובץ ה-CSV של בנק הפועלים (אתר עסקי).
// עמודות: תאריך | תיאור הפעולה | פרטים | חשבון | אסמכתא | תאריך ערך |
//         חובה | זכות | יתרה לאחר פעולה
// הקובץ מיוצא בקידוד windows-1255. המפרט מבוסס על האפיון —
// יש לכייל מול קובץ אמיתי כשיתקבל (סעיף 15.2 באפיון).

export interface BankCsvRow {
  rowNumber: number; // מספר השורה בקובץ המקורי
  txnDate: string; // ISO yyyy-mm-dd
  valueDate: string | null;
  description: string | null;
  details: string | null;
  account: string | null;
  reference: string | null;
  credit: string; // סכום כמחרוזת עשרונית — לא float
  balanceAfter: string | null;
  rowHash: string;
}

export interface ParsedBankFile {
  headerRowNumber: number;
  encoding: "windows-1255" | "utf-8" | "xlsx";
  rows: BankCsvRow[]; // שורות זכות בלבד, בסדר כרונולוגי עולה
  debitRowsFiltered: number; // שורות חובה שסוננו
  skippedRows: { rowNumber: number; reason: string }[];
  duplicatesInFile: number; // שורות זהות לחלוטין בתוך הקובץ עצמו
}

const HEADER_ALIASES: Record<string, keyof RawRow> = {
  "תאריך": "txnDate",
  "תיאור הפעולה": "description",
  "תיאור פעולה": "description",
  "פרטים": "details",
  "חשבון": "account",
  "אסמכתא": "reference",
  "אסמכתה": "reference",
  "תאריך ערך": "valueDate",
  "חובה": "debit",
  "זכות": "credit",
  "יתרה לאחר פעולה": "balanceAfter",
  "יתרה": "balanceAfter",
};

interface RawRow {
  txnDate: string;
  description: string;
  details: string;
  account: string;
  reference: string;
  valueDate: string;
  debit: string;
  credit: string;
  balanceAfter: string;
}

/** זיהוי קידוד: אם הקובץ UTF-8 תקין עם עברית — UTF-8; אחרת windows-1255. */
export function decodeBankFile(buffer: Buffer): {
  text: string;
  encoding: "windows-1255" | "utf-8";
} {
  // BOM של UTF-8
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return { text: buffer.subarray(3).toString("utf8"), encoding: "utf-8" };
  }
  try {
    const utf8 = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    if (/[א-ת]/.test(utf8)) return { text: utf8, encoding: "utf-8" };
  } catch {
    // לא UTF-8 תקין — נמשיך ל-1255
  }
  return {
    text: new TextDecoder("windows-1255").decode(buffer),
    encoding: "windows-1255",
  };
}

/**
 * פרסור שורת CSV עם תמיכה בשדות מצוטטים.
 * גרשיים נחשבים פתיחת ציטוט רק בתחילת שדה — גרש באמצע טקסט
 * (למשל 'העברת זה"ב', 'מע"מ') הוא תו רגיל.
 */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"' && cur === "") {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** תאריך ישראלי DD/MM/YYYY או DD/MM/YY → ISO. מחזיר null אם לא תקין. */
export function parseIsraeliDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (!m) return null;
  const [, d, mo, yRaw] = m;
  const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
  const day = Number(d);
  const month = Number(mo);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** סכום: "1,234.56" / "₪1,234.56" → "1234.56". ריק/אפס → null. */
export function parseAmount(raw: string): string | null {
  const cleaned = raw.replace(/[^\d.\-]/g, "");
  if (!cleaned || !/\d/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n === 0) return null;
  // תמיד שתי ספרות אחרי הנקודה — כך אותה תנועה מקבלת אותו row_hash
  // בין ייצוא CSV ("1500.00") לייצוא xlsx (המספר 1500)
  return n.toFixed(2);
}

/**
 * מפתח מניעת הכפילות — שכבה ראשונה.
 * "יתרה לאחר פעולה" היא המבדיל הקריטי: שתי תנועות זהות באותו יום
 * יציגו יתרה שונה.
 */
export function computeRowHash(row: {
  account: string | null;
  txnDate: string;
  reference: string | null;
  credit: string;
  balanceAfter: string | null;
}): string {
  const key = [
    row.account ?? "",
    row.txnDate,
    row.reference ?? "",
    row.credit,
    row.balanceAfter ?? "",
  ].join("|");
  return createHash("sha256").update(key, "utf8").digest("hex");
}

export type BankHeaderMap = { index: number; field: keyof RawRow }[];

/** ממפה שורת תאים לעמודות הבנק המוכרות. ריק = לא שורת כותרות. */
export function mapBankHeaders(cells: string[]): BankHeaderMap {
  const mapped: BankHeaderMap = [];
  cells.forEach((c, idx) => {
    const clean = (c ?? "").replace(/\s+/g, " ").trim();
    const field = HEADER_ALIASES[clean];
    if (field && !mapped.some((m) => m.field === field)) {
      mapped.push({ index: idx, field });
    }
  });
  return mapped;
}

/** האם שורת תאים היא שורת הכותרות של דף חשבון (לפחות 4 כותרות מוכרות)? */
export function isBankHeaderRow(cells: string[]): boolean {
  return mapBankHeaders(cells).length >= 4;
}

/**
 * פענוח קובץ בנק בפורמט CSV: קידוד → שורות → הליבה המשותפת.
 */
export function parseBankCsv(buffer: Buffer): ParsedBankFile {
  const { text, encoding } = decodeBankFile(buffer);
  const table = text.split(/\r?\n/).map((line) => splitCsvLine(line));
  return parseBankTable(table, encoding);
}

/**
 * הליבה המשותפת ל-CSV ול-xlsx: טבלת תאים (מחרוזות) → כותרות →
 * סינון חובה → row_hash → מיון כרונולוגי עולה (כלל ברזל 9).
 */
export function parseBankTable(
  table: string[][],
  encoding: ParsedBankFile["encoding"]
): ParsedBankFile {
  // זיהוי שורת הכותרות: השורה הראשונה עם לפחות 4 כותרות מוכרות
  let headerRowNumber = -1;
  let headerMap: BankHeaderMap = [];
  for (let i = 0; i < Math.min(table.length, 20); i++) {
    const mapped = mapBankHeaders(table[i]);
    if (mapped.length >= 4) {
      headerRowNumber = i + 1;
      headerMap = mapped;
      break;
    }
  }
  if (headerRowNumber === -1) {
    throw new Error(
      "לא זוהתה שורת כותרות בקובץ — ודא שזה ייצוא של תנועות החשבון (תאריך, פרטים, זכות...)"
    );
  }
  const required: (keyof RawRow)[] = ["txnDate", "credit"];
  for (const f of required) {
    if (!headerMap.some((m) => m.field === f)) {
      throw new Error(`עמודה חסרה בקובץ: ${f === "txnDate" ? "תאריך" : "זכות"}`);
    }
  }

  const rows: BankCsvRow[] = [];
  const skippedRows: { rowNumber: number; reason: string }[] = [];
  const seenHashes = new Set<string>();
  let debitRowsFiltered = 0;
  let duplicatesInFile = 0;

  for (let i = headerRowNumber; i < table.length; i++) {
    const cells = table[i];
    if (!cells.some((c) => c && c.trim())) continue;
    const raw = {} as RawRow;
    for (const { index, field } of headerMap) {
      raw[field] = cells[index] ?? "";
    }

    const credit = parseAmount(raw.credit ?? "");
    if (credit === null) {
      // שורת חובה או שורה ללא סכום זכות — מסוננת (כלל עיבוד 1)
      debitRowsFiltered++;
      continue;
    }

    const txnDate = parseIsraeliDate(raw.txnDate ?? "");
    if (!txnDate) {
      skippedRows.push({
        rowNumber: i + 1,
        reason: `תאריך לא תקין: "${raw.txnDate}"`,
      });
      continue;
    }

    const row: BankCsvRow = {
      rowNumber: i + 1,
      txnDate,
      valueDate: parseIsraeliDate(raw.valueDate ?? ""),
      description: raw.description?.trim() || null,
      details: raw.details?.trim() || null,
      account: raw.account?.trim() || null,
      reference: raw.reference?.trim() || null,
      credit,
      balanceAfter: parseAmount(raw.balanceAfter ?? "") ?? null,
      rowHash: "",
    };
    row.rowHash = computeRowHash(row);

    if (seenHashes.has(row.rowHash)) {
      duplicatesInFile++;
      continue;
    }
    seenHashes.add(row.rowHash);
    rows.push(row);
  }

  // עיבוד בסדר כרונולוגי עולה בתוך האצווה (כלל ברזל 9).
  // מיון יציב — שורות מאותו יום נשארות בסדר הופעתן בקובץ.
  rows.sort((a, b) => a.txnDate.localeCompare(b.txnDate));

  return {
    headerRowNumber,
    encoding,
    rows,
    debitRowsFiltered,
    skippedRows,
    duplicatesInFile,
  };
}
