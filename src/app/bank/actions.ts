"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { setTransactionIgnored } from "@/lib/bank/import";
import { runMatching, confirmMatch, clearMatch } from "@/lib/match/engine";
import { CURRENT_ACTOR } from "@/lib/format";

export async function toggleIgnoredAction(id: string, ignored: boolean) {
  await setTransactionIgnored(sql, id, ignored, CURRENT_ACTOR);
  revalidatePath("/bank");
}

export async function runMatchingAction() {
  await runMatching(sql, { actor: CURRENT_ACTOR });
  revalidatePath("/bank");
}

export async function confirmMatchAction(fd: FormData) {
  const txnId = fd.get("txnId");
  const clientId = fd.get("clientId");
  if (typeof txnId !== "string" || typeof clientId !== "string" || !clientId) {
    throw new Error("בחר לקוח לפני האישור");
  }
  await confirmMatch(sql, txnId, clientId, CURRENT_ACTOR);
  revalidatePath("/bank");
}

export async function clearMatchAction(id: string) {
  await clearMatch(sql, id, CURRENT_ACTOR);
  revalidatePath("/bank");
}
