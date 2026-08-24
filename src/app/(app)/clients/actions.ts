"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import {
  createClient,
  updateClient,
  type ClientInput,
} from "@/lib/clients/repo";
import { createManualCharge } from "@/lib/charges/engine";
import { getActor } from "@/lib/auth/actor";
import { toActionResult, type ActionResult } from "@/lib/action-result";

function str(fd: FormData, name: string): string | null {
  const v = fd.get(name);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t || null;
}

function num(fd: FormData, name: string): number | null {
  const s = str(fd, name);
  if (s === null) return null;
  const n = Number(s.replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function formToInput(fd: FormData): ClientInput {
  return {
    taxId: str(fd, "taxId") ?? "",
    name: str(fd, "name") ?? "",
    activity: str(fd, "activity"),
    entityType: str(fd, "entityType"),
    withholdingFile: str(fd, "withholdingFile"),
    spouseName: str(fd, "spouseName"),
    spouseTaxId: str(fd, "spouseTaxId"),
    vatFrequency: str(fd, "vatFrequency"),
    ni102Frequency: str(fd, "ni102Frequency"),
    tax102Frequency: str(fd, "tax102Frequency"),
    advancesRate: num(fd, "advancesRate"),
    advancesFrequency: str(fd, "advancesFrequency"),
    permissions: str(fd, "permissions"),
    phone: str(fd, "phone"),
    email: str(fd, "email"),
    clientType: (str(fd, "clientType") as "קבוע" | "מזדמן") ?? "קבוע",
    rate: num(fd, "rate"),
    openingBalance: num(fd, "openingBalance") ?? 0,
    isActive: fd.get("isActive") !== null,
    notes: str(fd, "notes"),
  };
}

export async function createClientAction(fd: FormData): Promise<ActionResult> {
  let createdId: string | null = null;
  const result = await toActionResult(async () => {
    const input = formToInput(fd);
    const created = await createClient(sql, input, await getActor());
    createdId = created.id as string;
  });
  if (result?.error) return result;
  revalidatePath("/clients");
  // redirect זורק במכוון — חייב להיות מחוץ ל-try/catch
  redirect(`/clients/${createdId}`);
}

export async function updateClientAction(
  id: string,
  fd: FormData
): Promise<ActionResult> {
  const result = await toActionResult(async () => {
    const input = formToInput(fd);
    await updateClient(sql, id, input, await getActor());
  });
  if (result?.error) return result;
  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  redirect(`/clients/${id}`);
}

export async function createChargeAction(
  clientId: string,
  fd: FormData
): Promise<ActionResult> {
  return toActionResult(async () => {
    const amount = num(fd, "amount");
    const chargeDate = str(fd, "chargeDate");
    if (amount === null) throw new Error("הזן סכום לחיוב");
    if (!chargeDate) throw new Error("הזן תאריך לחיוב");
    await createManualCharge(
      sql,
      { clientId, amount, chargeDate, description: str(fd, "description") },
      await getActor()
    );
    revalidatePath(`/clients/${clientId}`);
    revalidatePath("/balances");
    return "החיוב נוסף";
  });
}

export async function toggleActiveAction(
  id: string,
  isActive: boolean
): Promise<ActionResult> {
  return toActionResult(async () => {
    await updateClient(sql, id, { isActive }, await getActor());
    revalidatePath("/clients");
    revalidatePath(`/clients/${id}`);
    return isActive ? "הלקוח הופעל" : "הלקוח סומן כלא פעיל";
  });
}
