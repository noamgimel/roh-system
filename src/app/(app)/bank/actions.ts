"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { setTransactionIgnored } from "@/lib/bank/import";
import { runMatching, confirmMatch, clearMatch } from "@/lib/match/engine";
import { getActor } from "@/lib/auth/actor";

export async function toggleIgnoredAction(id: string, ignored: boolean) {
  await setTransactionIgnored(sql, id, ignored, await getActor());
  revalidatePath("/bank");
}

export async function runMatchingAction() {
  await runMatching(sql, { actor: await getActor() });
  revalidatePath("/bank");
}

export async function confirmMatchAction(fd: FormData) {
  const txnId = fd.get("txnId");
  const clientId = fd.get("clientId");
  if (typeof txnId !== "string" || typeof clientId !== "string" || !clientId) {
    throw new Error("בחר לקוח לפני האישור");
  }
  await confirmMatch(sql, txnId, clientId, await getActor());
  revalidatePath("/bank");
}

export async function clearMatchAction(id: string) {
  await clearMatch(sql, id, await getActor());
  revalidatePath("/bank");
}
