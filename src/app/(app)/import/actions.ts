"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { resolvePending, deletePending } from "@/lib/clients/pending";
import { getActor } from "@/lib/auth/actor";
import { toActionResult, type ActionResult } from "@/lib/action-result";

export async function resolvePendingAction(fd: FormData): Promise<ActionResult> {
  return toActionResult(async () => {
    const id = fd.get("pendingId");
    const taxId = fd.get("taxId");
    const name = fd.get("name");
    if (typeof id !== "string" || !id) throw new Error("שורה לא זוהתה — רענן ונסה שוב");
    if (typeof taxId !== "string" || !taxId.trim()) throw new Error('הזן ת"ז/ח"פ');
    const created = await resolvePending(
      sql,
      id,
      {
        taxId: taxId.trim(),
        name: typeof name === "string" && name.trim() ? name.trim() : null,
      },
      await getActor()
    );
    revalidatePath("/import");
    revalidatePath("/clients");
    return `הלקוח "${created.name}" נוצר`;
  });
}

export async function deletePendingAction(id: string): Promise<ActionResult> {
  return toActionResult(async () => {
    await deletePending(sql, id, await getActor());
    revalidatePath("/import");
    return "השורה הוסרה";
  });
}
