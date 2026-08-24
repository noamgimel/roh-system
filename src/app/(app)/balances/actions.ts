"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { runMonthlyCharges } from "@/lib/charges/engine";
import { setCutoffDate } from "@/lib/settings";
import { getActor } from "@/lib/auth/actor";
import { toActionResult, type ActionResult } from "@/lib/action-result";

export async function runMonthlyChargesAction(): Promise<ActionResult> {
  return toActionResult(async () => {
    const report = await runMonthlyCharges(sql, { actor: await getActor() });
    revalidatePath("/balances");
    revalidatePath("/clients");
    return report.created > 0
      ? `נוצרו ${report.created} חיובים חודשיים לתקופה ${report.period}`
      : `אין חיובים חדשים — ${report.skippedExisting} כבר קיימים לתקופה ${report.period}`;
  });
}

export async function setCutoffAction(fd: FormData): Promise<ActionResult> {
  return toActionResult(async () => {
    const raw = fd.get("cutoffDate");
    const date = typeof raw === "string" && raw ? raw : null;
    await setCutoffDate(sql, date, await getActor());
    revalidatePath("/balances");
    revalidatePath("/clients");
    revalidatePath("/queue");
    revalidatePath("/bank");
    return date ? "תאריך החתך עודכן" : "תאריך החתך נמחק";
  });
}
