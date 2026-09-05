// זיהוי מוקדם של "קובץ אקסל" שאינו באמת xlsx — כדי להחזיר הודעה
// שמסבירה מה לעשות במקום "לא נמצא גיליון" סתמי.
// בודק רק חתימות ושמות קבצים פנימיים בארכיון — לא קורא תוכן.

/** חוברת אקסל אמיתית — לפי תוכן, בלי קשר לסיומת (macOS מסתיר סיומות). */
export function isXlsxBuffer(buffer: Buffer): boolean {
  return (
    buffer.subarray(0, 4).toString("hex") === "504b0304" &&
    buffer.includes("xl/workbook.xml")
  );
}

/** קובץ טקסט (CSV) — לא zip, לא OLE, ורובו תווים קריאים. */
export function looksLikeCsv(buffer: Buffer): boolean {
  const sig = buffer.subarray(0, 4).toString("hex");
  if (sig === "504b0304" || sig === "d0cf11e0") return false;
  const sample = buffer.subarray(0, 2048);
  let binary = 0;
  for (const b of sample) if (b === 0 || (b < 9 && b !== 0)) binary++;
  return binary === 0 && sample.includes(",".charCodeAt(0));
}

export function describeNotXlsx(buffer: Buffer, fileName: string): string | null {
  const sig = buffer.subarray(0, 4).toString("hex");

  // xlsx מוצפן בסיסמה נשמר כ-OLE ולא כ-zip
  if (sig === "d0cf11e0") {
    return "הקובץ מוגן בסיסמה או בפורמט xls ישן. הוצא את הגיליון הרלוונטי לחוברת חדשה ושמור כ-xlsx בלי סיסמה.";
  }
  if (sig !== "504b0304") {
    return `הקובץ "${fileName}" אינו קובץ xlsx תקין. שמור/ייצא אותו מחדש כ-Excel Workbook (.xlsx).`;
  }
  // zip אמיתי — האם הוא חוברת אקסל? שמות הקבצים בארכיון אינם דחוסים
  if (buffer.includes("xl/workbook.xml")) return null;
  if (buffer.includes("Index/") || buffer.includes("Metadata/")) {
    return "זה קובץ Numbers של אפל עם סיומת xlsx — שינוי הסיומת אינו ממיר אותו. ב-Numbers: קובץ ← ייצא ל… ← Excel, ושמור את התוצאה.";
  }
  return "הארכיון אינו חוברת אקסל (חסר xl/workbook.xml). ייצא מחדש כ-Excel Workbook (.xlsx).";
}
