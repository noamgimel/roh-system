"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { runMonthlyCharges } from "@/lib/charges/engine";
import { getActor } from "@/lib/auth/actor";

export async function runMonthlyChargesAction() {
  await runMonthlyCharges(sql, { actor: await getActor() });
  revalidatePath("/balances");
  revalidatePath("/clients");
}
