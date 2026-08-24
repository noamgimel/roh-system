"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { runMonthlyCharges } from "@/lib/charges/engine";
import { setCutoffDate } from "@/lib/settings";
import { getActor } from "@/lib/auth/actor";

export async function runMonthlyChargesAction() {
  await runMonthlyCharges(sql, { actor: await getActor() });
  revalidatePath("/balances");
  revalidatePath("/clients");
}

export async function setCutoffAction(fd: FormData) {
  const raw = fd.get("cutoffDate");
  const date = typeof raw === "string" && raw ? raw : null;
  await setCutoffDate(sql, date, await getActor());
  revalidatePath("/balances");
  revalidatePath("/clients");
  revalidatePath("/queue");
  revalidatePath("/bank");
}
