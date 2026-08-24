"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { setTransactionIgnored } from "@/lib/bank/import";
import { getActor } from "@/lib/auth/actor";

export async function toggleIgnoredAction(id: string, ignored: boolean) {
  await setTransactionIgnored(sql, id, ignored, await getActor());
  revalidatePath("/bank");
  revalidatePath("/queue");
  revalidatePath("/balances");
}
