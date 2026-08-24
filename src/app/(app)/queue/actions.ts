"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { confirmMatch, clearMatch, runMatching } from "@/lib/match/engine";
import {
  approveTransaction,
  approveAllMatched,
  splitTransaction,
  unapproveTransaction,
  type SplitPart,
} from "@/lib/match/queue";
import { setTransactionIgnored } from "@/lib/bank/import";
import { getActor } from "@/lib/auth/actor";

function refresh() {
  revalidatePath("/queue");
  revalidatePath("/bank");
  revalidatePath("/balances");
}

export async function confirmMatchAction(fd: FormData) {
  const txnId = fd.get("txnId");
  const clientId = fd.get("clientId");
  if (typeof txnId !== "string" || typeof clientId !== "string" || !clientId) {
    throw new Error("בחר לקוח לפני השיוך");
  }
  await confirmMatch(sql, txnId, clientId, await getActor());
  refresh();
}

export async function clearMatchAction(id: string) {
  await clearMatch(sql, id, await getActor());
  refresh();
}

export async function approveAction(id: string) {
  await approveTransaction(sql, id, await getActor());
  refresh();
}

export async function approveAllAction() {
  await approveAllMatched(sql, await getActor());
  refresh();
}

export async function unapproveAction(id: string) {
  await unapproveTransaction(sql, id, await getActor());
  refresh();
}

export async function splitAction(txnId: string, parts: SplitPart[]) {
  await splitTransaction(sql, txnId, parts, await getActor());
  refresh();
}

export async function ignoreAction(id: string) {
  await setTransactionIgnored(sql, id, true, await getActor());
  refresh();
}

export async function runMatchingAction() {
  await runMatching(sql, { actor: await getActor() });
  refresh();
}
