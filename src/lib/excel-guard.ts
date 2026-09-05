// זיהוי מוקדם של "קובץ אקסל" שאינו באמת xlsx — כדי להחזיר הודעה
// שמסבירה מה לעשות במקום "לא נמצא גיליון" סתמי.
// בודק רק חתימות ושמות קבצים פנימיים בארכיון — לא קורא תוכן.

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
