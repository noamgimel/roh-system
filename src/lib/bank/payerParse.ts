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
  payerTaxId: string | null; // ת"ז/ח"פ של המשלם — 9 ספרות מרופדות
}

// בנק (1-2 ספרות) - סניף (1-3 ספרות) - חשבון (4 ספרות ומעלה)
const ACCOUNT_AT_END = /(\d{1,2}-\d{1,3}-\d{4,10})\s*$/;

// בקובץ האמיתי של הפועלים הפרטים מסתיימים ב-"(מס ת-ז:012345675" —
// ת"ז/ח"פ של בעל החשבון המשלם. תבניות: ת-ז / ת.ז / ת"ז / תז / ח.פ / ח"פ / מס
const TAX_ID_LABELED =
  /(?:ת["״'.\-\s]?ז|ח["״'.\-\s]?פ|מס['׳]?)\s*[:.\-]?\s*(\d{8,9})(?!\d)/;
// גיבוי: 9 ספרות עומדות לבד (לא חלק ממפתח חשבון)
const TAX_ID_BARE = /(?<![\d-])(\d{9})(?![\d-])/;

/** מחלץ ת"ז/ח"פ מטקסט הפרטים; מחזיר את המספר המרופד ואת הטקסט בלעדיו. */
export function extractTaxId(text: string): { taxId: string | null; rest: string } {
  const labeled = text.match(TAX_ID_LABELED);
  if (labeled) {
    const full = labeled[0];
    const idx = labeled.index ?? 0;
    // מסירים שאריות שלפני התווית: סוגר פותח ו/או "מס" (כמו ב-"(מס ת-ז:…")
    const before = text
      .slice(0, idx)
      .replace(/[\s(]*(?:מס['׳]?)?[\s(]*$/, "");
    return {
      taxId: labeled[1].padStart(9, "0"),
      rest: (before + text.slice(idx + full.length)).replace(/\s+/g, " ").trim(),
    };
  }
  const bare = text.match(TAX_ID_BARE);
  if (bare) {
    return {
      taxId: bare[1],
      rest: text.replace(bare[0], " ").replace(/\s+/g, " ").trim(),
    };
  }
  return { taxId: null, rest: text };
}

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

  // ת"ז של המשלם — המפתח החזק בקובץ האמיתי; מוסרת מהטקסט לפני שאר הפענוח
  const idResult = extractTaxId(rest);
  const payerTaxId = idResult.taxId;
  rest = idResult.rest;

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
    purpose =
      rest
        .slice(rest.indexOf("עבור:", forIdx) + "עבור:".length)
        .replace(/[\s.()]+$/, "")
        .trim() || null;
  } else {
    payerName = rest.trim();
  }

  if (!payerName) return null;
  return { payerName, purpose, bankKey, payerTaxId };
}
