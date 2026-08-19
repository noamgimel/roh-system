"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { runMonthlyCharges } from "@/lib/charges/engine";
import { CURRENT_ACTOR } from "@/lib/format";

export async function runMonthlyChargesAction() {
  await runMonthlyCharges(sql, { actor: CURRENT_ACTOR });
  revalidatePath("/balances");
  revalidatePath("/clients");
}
