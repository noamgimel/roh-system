"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { updateClient } from "@/lib/clients/repo";
import { getActor } from "@/lib/auth/actor";
import { toActionResult, type ActionResult } from "@/lib/action-result";

/**
 * שמירת יתרת פתיחה ללקוח בודד — נקרא משורת הטבלה בעריכה ישירה.
 * יתרה שלילית מותרת (לקוח ביתרת זכות).
 */
export async function saveOpeningBalanceAction(
  clientId: string,
  value: number
): Promise<ActionResult> {
  return toActionResult(async () => {
    if (!Number.isFinite(value)) {
      throw new Error("הזן סכום מספרי");
    }
    if (Math.abs(value) > 9_999_999) {
      throw new Error("הסכום גדול מדי — בדוק את ההקלדה");
    }
    await updateClient(
      sql,
      clientId,
      { openingBalance: value },
      await getActor()
    );
    revalidatePath("/balances");
    revalidatePath("/clients");
    revalidatePath(`/clients/${clientId}`);
  });
}
