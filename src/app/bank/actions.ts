"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { setTransactionIgnored } from "@/lib/bank/import";
import { CURRENT_ACTOR } from "@/lib/format";

export async function toggleIgnoredAction(id: string, ignored: boolean) {
  await setTransactionIgnored(sql, id, ignored, CURRENT_ACTOR);
  revalidatePath("/bank");
}
