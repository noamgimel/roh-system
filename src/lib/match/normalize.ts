// נרמול שמות להשוואה (סעיף 7 באפיון):
// הסרת ניקוד, תארים ("בע"מ", "עו"ד", "רו"ח"), פיסוק ורווחים כפולים.
// ההשוואה חסרת רגישות לרישום (רלוונטי לשמות לועזיים).

// הערה: \b של JS אינו עובד עם עברית, לכן התיחום הוא רווח/קצה מפורש.
// הגרשיים בקיצור הם חובה — "בעמ"/"עוד"/"רוח" בלי גרש הן מילים לגיטימיות.
const TITLES = /(?:^|\s)(?:בע["״'׳]מ|עו["״'׳]ד|רו["״'׳]ח)(?=\s|$)/g;

export function normalizeName(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/[֑-ׇ]/g, "") // ניקוד וטעמים
    .replace(TITLES, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // פיסוק
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * תאימות חלקית לשם (כלל 4): אחד מכיל את השני אחרי נרמול.
 * דורש אורך מינימלי כדי לא להתאים על רעש.
 */
export function partialNameMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na.length < 4 || nb.length < 4) return false;
  if (na === nb) return false; // תאימות מלאה מטופלת בכלל 3
  return na.includes(nb) || nb.includes(na);
}
