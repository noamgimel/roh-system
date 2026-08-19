import type { BankCsvRow } from "./csv";

// כללי החרגה אוטומטיים (סעיף 6.5 באפיון):
// תנועות זכות שאינן תשלומי לקוחות מסומנות ignored אוטומטית,
// והמשתמש תמיד יכול להחזיר אותן ידנית (או להחריג ידנית אחרות).
// הרשימה תכויל מול נתונים אמיתיים בשלב ג'.

export interface ExclusionRule {
  id: string;
  reason: string;
  matches: (row: BankCsvRow) => boolean;
}

function textOf(row: BankCsvRow): string {
  return `${row.description ?? ""} ${row.details ?? ""}`;
}

export const EXCLUSION_RULES: ExclusionRule[] = [
  {
    id: "tax_authority_refund",
    reason: "החזר מרשות המסים",
    matches: (row) =>
      /רשות המס|מס הכנסה|מע"מ|מע״מ|מיסים|שומה|החזר מס/.test(textOf(row)),
  },
  {
    id: "internal_transfer",
    reason: "העברה בין חשבונות של העסק",
    matches: (row) =>
      /העברה בין חשבונות|העברה מחשבון|חשבון משנה|העברה עצמית/.test(
        textOf(row)
      ),
  },
  {
    id: "national_insurance_refund",
    reason: "החזר מביטוח לאומי",
    matches: (row) => /ביטוח לאומי|המוסד לביטוח/.test(textOf(row)),
  },
];

/** מחזיר את סיבת ההחרגה אם התנועה עונה על אחד הכללים, אחרת null. */
export function autoExclusionReason(row: BankCsvRow): string | null {
  for (const rule of EXCLUSION_RULES) {
    if (rule.matches(row)) return rule.reason;
  }
  return null;
}
