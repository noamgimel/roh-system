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

export async function createClientAction(fd: FormData) {
  const input = formToInput(fd);
  const created = await createClient(sql, input, await getActor());
  revalidatePath("/clients");
  redirect(`/clients/${created.id}`);
}

export async function updateClientAction(id: string, fd: FormData) {
  const input = formToInput(fd);
  await updateClient(sql, id, input, await getActor());
  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  redirect(`/clients/${id}`);
}

export async function createChargeAction(clientId: string, fd: FormData) {
  const amount = num(fd, "amount");
  const chargeDate = str(fd, "chargeDate");
  if (amount === null || !chargeDate) {
    throw new Error("סכום ותאריך הם שדות חובה");
  }
  await createManualCharge(
    sql,
    {
      clientId,
      amount,
      chargeDate,
      description: str(fd, "description"),
    },
    await getActor()
  );
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/balances");
}

export async function toggleActiveAction(id: string, isActive: boolean) {
  await updateClient(sql, id, { isActive }, await getActor());
  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
}
