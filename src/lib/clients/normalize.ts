// נרמול ערכים מהאקסל — כל הפונקציות סובלניות לקלט מלוכלך.

/**
 * ת"ז / ח"פ: מסירים כל מה שאינו ספרה ומרפדים באפסים מוליכים ל-9 ספרות.
 * (אקסל נוהג למחוק אפסים מוליכים — "034..." הופך ל-"34...").
 * מחזיר null אם הערך לא יכול להיות מזהה חוקי.
 */
export function normalizeTaxId(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length < 5 || digits.length > 9) return null;
  return digits.padStart(9, "0");
}

/** טלפון: ספרות בלבד, שומרים + בינלאומי אם קיים בתחילת הערך. */
export function normalizePhone(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const plus = s.startsWith("+") ? "+" : "";
  const digits = s.replace(/\D/g, "");
  if (!digits) return null;
  return plus + digits;
}

/** טקסט חופשי: חיתוך רווחים; מחרוזת ריקה הופכת ל-null. */
export function normalizeText(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).replace(/\s+/g, " ").trim();
  return s || null;
}

/** מספר עשרוני (תעריף, אחוז מקדמות). מחזיר null אם לא מספר. */
export function normalizeNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const s = String(raw).replace(/[^\d.\-]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** עמודת "סטטוס" באקסל → דגל פעיל/לא פעיל. ערך ריק נחשב פעיל. */
export function normalizeIsActive(raw: unknown): boolean {
  const s = normalizeText(raw);
  if (!s) return true;
  // מהקובץ האמיתי: "לא פעילה משנת 2025", "עבר לרו"ח אחר ב1.3.25"
  const inactive = ["לא פעיל", "לא פעילה", "לא-פעיל", "סגור", "מוקפא", "עזב", "עבר ל", "עברה ל", "נסגר", "הפסיק"];
  return !inactive.some((v) => s.includes(v));
}
