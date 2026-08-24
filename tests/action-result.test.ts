import { describe, it, expect } from "vitest";
import { toActionResult } from "@/lib/action-result";

describe("toActionResult — שגיאות הופכות להודעות, לא לקריסות", () => {
  it("הצלחה עם הודעה", async () => {
    expect(await toActionResult(async () => "בוצע")).toEqual({
      success: "בוצע",
    });
  });

  it("הצלחה שקטה", async () => {
    expect(await toActionResult(async () => {})).toBeUndefined();
  });

  it("שגיאת Error מחזירה את ההודעה שלה", async () => {
    const res = await toActionResult(async () => {
      throw new Error("בחר לקוח מהרשימה לפני השיוך");
    });
    expect(res).toEqual({ error: "בחר לקוח מהרשימה לפני השיוך" });
  });

  it("הפרת ייחודיות של ת\"ז מתורגמת להודעה ידידותית", async () => {
    const res = await toActionResult(async () => {
      const e = new Error("duplicate key value") as Error & {
        code: string;
        constraint_name: string;
      };
      e.code = "23505";
      e.constraint_name = "clients_tax_id_key";
      throw e;
    });
    expect(res?.error).toBe('לקוח עם ת"ז/ח"פ זה כבר קיים במערכת');
  });

  it("שגיאה לא מזוהה מקבלת הודעה גנרית", async () => {
    const res = await toActionResult(async () => {
      throw "something weird";
    });
    expect(res?.error).toBe("שגיאה לא צפויה — נסה שוב");
  });
});
