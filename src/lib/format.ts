// עזרי תצוגה משותפים

export function formatMoney(value: unknown): string {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(n);
}

export function formatDate(value: unknown): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("he-IL", { dateStyle: "short" }).format(
    new Date(value as string)
  );
}

// עד שיש מערכת התחברות — משתמש יחיד לפי האפיון
export const CURRENT_ACTOR = "משתמש-ראשי";
