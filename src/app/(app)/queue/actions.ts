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
import { toActionResult, type ActionResult } from "@/lib/action-result";

function refresh() {
  revalidatePath("/queue");
  revalidatePath("/bank");
  revalidatePath("/balances");
}

export async function confirmMatchAction(fd: FormData): Promise<ActionResult> {
  return toActionResult(async () => {
    const txnId = fd.get("txnId");
    const clientId = fd.get("clientId");
    if (typeof txnId !== "string" || !txnId) {
      throw new Error("תנועה לא זוהתה — רענן את הדף ונסה שוב");
    }
    if (typeof clientId !== "string" || !clientId) {
      throw new Error("בחר לקוח מהרשימה לפני השיוך");
    }
    await confirmMatch(sql, txnId, clientId, await getActor());
    refresh();
    return "השיוך נשמר";
  });
}

export async function clearMatchAction(id: string): Promise<ActionResult> {
  return toActionResult(async () => {
    await clearMatch(sql, id, await getActor());
    refresh();
  });
}

export async function approveAction(id: string): Promise<ActionResult> {
  return toActionResult(async () => {
    await approveTransaction(sql, id, await getActor());
    refresh();
    return "התשלום אושר ונרשם מול היתרה";
  });
}

export async function approveAllAction(): Promise<ActionResult> {
  return toActionResult(async () => {
    const { approved } = await approveAllMatched(sql, await getActor());
    refresh();
    return approved > 0
      ? `${approved} תשלומים אושרו ונרשמו מול היתרות`
      : "אין תנועות מותאמות לאישור";
  });
}

export async function unapproveAction(id: string): Promise<ActionResult> {
  return toActionResult(async () => {
    await unapproveTransaction(sql, id, await getActor());
    refresh();
    return "האישור בוטל והיתרה עודכנה";
  });
}

export async function splitAction(
  txnId: string,
  parts: SplitPart[]
): Promise<ActionResult> {
  return toActionResult(async () => {
    await splitTransaction(sql, txnId, parts, await getActor());
    refresh();
    return "הפיצול נרשם ואושר";
  });
}

export async function ignoreAction(id: string): Promise<ActionResult> {
  return toActionResult(async () => {
    await setTransactionIgnored(sql, id, true, await getActor());
    refresh();
    return 'התנועה סומנה "לא תשלום לקוח"';
  });
}

export async function runMatchingAction(): Promise<ActionResult> {
  return toActionResult(async () => {
    const report = await runMatching(sql, { actor: await getActor() });
    refresh();
    return `הותאמו אוטומטית: ${report.matchedExact} · הצעות: ${report.suggested} · בתור: ${report.queued}`;
  });
}
