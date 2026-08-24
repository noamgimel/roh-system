"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { setTransactionIgnored } from "@/lib/bank/import";
import { getActor } from "@/lib/auth/actor";
import { toActionResult, type ActionResult } from "@/lib/action-result";

export async function toggleIgnoredAction(
  id: string,
  ignored: boolean
): Promise<ActionResult> {
  return toActionResult(async () => {
    await setTransactionIgnored(sql, id, ignored, await getActor());
    revalidatePath("/bank");
    revalidatePath("/queue");
    revalidatePath("/balances");
    return ignored ? 'סומן "לא תשלום לקוח"' : "הוחזר לעיבוד";
  });
}
