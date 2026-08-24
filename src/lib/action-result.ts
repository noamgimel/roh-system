// תוצאת server action אחידה: במקום לזרוק שגיאה (שמפילה את המסך
// ובפרודקשן גם מוסתרת), פעולה מחזירה error/success והממשק מציג טוסט.

export type ActionResult = { error?: string; success?: string } | void;

/** מריץ פעולה והופך כל שגיאה להודעה ידידותית. */
export async function toActionResult(
  fn: () => Promise<string | void>
): Promise<ActionResult> {
  try {
    const success = await fn();
    return success ? { success } : undefined;
  } catch (e) {
    return { error: friendlyError(e) };
  }
}

function friendlyError(e: unknown): string {
  if (e && typeof e === "object" && "code" in e) {
    // שגיאות PostgreSQL נפוצות
    const code = (e as { code: string }).code;
    if (code === "23505") {
      const constraint = (e as { constraint_name?: string }).constraint_name;
      if (constraint === "clients_tax_id_key") {
        return 'לקוח עם ת"ז/ח"פ זה כבר קיים במערכת';
      }
      return "הרשומה כבר קיימת — פעולה כפולה נחסמה";
    }
    if (code === "23503") return "הרשומה מקושרת לנתונים אחרים — אי אפשר";
  }
  if (e instanceof Error && e.message) return e.message;
  return "שגיאה לא צפויה — נסה שוב";
}
