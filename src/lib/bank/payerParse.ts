// חילוץ פרטי המשלם משדה "פרטים" של תנועת הבנק.
// התבנית לפי האפיון: "המבצע: <שם המשלם> עבור: <טקסט חופשי> <בנק-סניף-חשבון>"
//
// המספר בסוף הוא בנק-סניף-חשבון של המשלם — מפתח ההתאמה החזק ביותר
// במערכת: שם משתנה בכתיב, מספר חשבון לא. "עבור:" הוא טקסט חופשי שהמשלם
// הקליד — רמז בלבד, לעולם לא החלטה.
//
// הפרסר חייב להיות סובלני: לא כל סוגי התנועות עומדים בתבנית.
// שורה שלא נפרסה נשארת ללא שדות משלם ונכנסת לתור הידני — לא נכשלת.
//
// ⚠️ מכויל על המפרט בלבד — חובה לכייל מול ייצוא אמיתי (סעיף 15.2 באפיון).

export interface ParsedPayerDetails {
  payerName: string;
  purpose: string | null;
  bankKey: string | null; // בנק-סניף-חשבון מנורמל
}

// בנק (1-2 ספרות) - סניף (1-3 ספרות) - חשבון (4 ספרות ומעלה)
const ACCOUNT_AT_END = /(\d{1,2}-\d{1,3}-\d{4,10})\s*$/;

/**
 * נרמול bank_key להשוואה יציבה בין ייצואים:
 * הסרת אפסים מוליכים בכל מקטע ("05-012-0011111" ≡ "5-12-11111").
 */
export function normalizeBankKey(raw: string): string {
  return raw
    .split("-")
    .map((seg) => seg.replace(/^0+(?=\d)/, ""))
    .join("-");
}

/** מחלץ שם משלם, מטרה ו-bank_key. מחזיר null אם התבנית לא זוהתה. */
export function parsePayerDetails(
  details: string | null | undefined
): ParsedPayerDetails | null {
  if (!details) return null;
  const s = details.replace(/\s+/g, " ").trim();

  const m = s.match(/המבצע:\s*(.+)$/);
  if (!m) return null;
  let rest = m[1];

  let bankKey: string | null = null;
  const acc = rest.match(ACCOUNT_AT_END);
  if (acc) {
    bankKey = normalizeBankKey(acc[1]);
    rest = rest.slice(0, acc.index).trim();
  }

  let payerName: string;
  let purpose: string | null = null;
  const forIdx = rest.search(/\sעבור:|^עבור:/);
  if (forIdx >= 0) {
    payerName = rest.slice(0, forIdx).trim();
    purpose = rest.slice(rest.indexOf("עבור:", forIdx) + "עבור:".length).trim() || null;
  } else {
    payerName = rest.trim();
  }

  if (!payerName) return null;
  return { payerName, purpose, bankKey };
}
