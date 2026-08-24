import type { Sql, TransactionSql } from "postgres";
import { writeAudit } from "@/lib/audit";
import { getCutoffDate } from "@/lib/settings";

// תור האישורים — סמנטיקת שלב א':
// approved = "אושר כתשלום לקוח ונרשם מול היתרה". אין כאן "אישור
// להנפקה" — זו סמנטיקה של שלב ב'. הרישום מול היתרה נעשה דרך שורות
// שיוך (transaction_allocations): אחת בתנועה רגילה, כמה בפיצול.
// תשלום חלקי אינו מקרה מיוחד: הסכום נרשם, והיתרה נשארת פתוחה.

async function loadPendingTxn(
  tx: TransactionSql,
  txnId: string,
  allowed: string[]
) {
  const [txn] = await tx`
    select * from bank_transactions where id = ${txnId}
  `;
  if (!txn) throw new Error("תנועה לא נמצאה");
  if (!allowed.includes(txn.status as string)) {
    throw new Error(`הפעולה אינה אפשרית בסטטוס "${txn.status}"`);
  }
  return txn;
}

/**
 * תנועה עד תאריך החתך (כולל) כבר גולמה ביתרת הפתיחה — אישור שלה
 * היה נרשם אך לא נספר ביתרה. חוסמים במקום לבלבל.
 */
async function assertAfterCutoff(tx: TransactionSql, txnDate: unknown) {
  const cutoff = await getCutoffDate(tx as unknown as Sql);
  const dateStr =
    txnDate instanceof Date
      ? txnDate.toISOString().slice(0, 10)
      : String(txnDate);
  if (cutoff && dateStr <= cutoff) {
    throw new Error(
      `התנועה מ-${dateStr} קודמת לתאריך החתך (${cutoff}) — היא כבר גולמה ביתרת הפתיחה. סמן אותה "לא תשלום לקוח" במקום לאשר`
    );
  }
}

/**
 * אישור תשלום: התנועה חייבת להיות משויכת ללקוח. נכתבת שורת שיוך
 * אחת על מלוא הסכום והסטטוס עובר ל-approved.
 */
export async function approveTransaction(
  sql: Sql,
  txnId: string,
  actor: string
) {
  return sql.begin(async (tx) => {
    const txn = await loadPendingTxn(tx, txnId, ["matched"]);
    if (!txn.matchedClientId) {
      throw new Error("אי אפשר לאשר תנועה בלי לקוח משויך");
    }
    await assertAfterCutoff(tx, txn.txnDate);
    await tx`
      insert into transaction_allocations (bank_transaction_id, client_id, amount)
      values (${txnId}, ${txn.matchedClientId as string}, ${txn.credit as string})
    `;
    const [updated] = await tx`
      update bank_transactions set status = 'approved'
      where id = ${txnId} returning *
    `;
    await writeAudit(tx, {
      actor,
      action: "payment_approve",
      entity: "bank_transactions",
      entityId: txnId,
      after: {
        client_id: txn.matchedClientId,
        amount: txn.credit,
        txn_date: txn.txnDate,
      },
    });
    return updated;
  });
}

/** אישור מרוכז של כל התנועות המותאמות. תנועות שלפני החתך מדולגות. */
export async function approveAllMatched(sql: Sql, actor: string) {
  const cutoff = await getCutoffDate(sql);
  const matched = await sql`
    select id from bank_transactions
    where status = 'matched' and matched_client_id is not null
      ${cutoff ? sql`and txn_date > ${cutoff}` : sql``}
    order by txn_date, created_at
  `;
  let approved = 0;
  for (const t of matched) {
    await approveTransaction(sql, t.id as string, actor);
    approved++;
  }
  return { approved };
}

export interface SplitPart {
  clientId: string;
  amount: number;
}

/**
 * פיצול תשלום מרוכז: תנועה אחת שמשלמת עבור כמה ישויות.
 * סכום החלקים חייב להיות שווה בדיוק לסכום התנועה; הפיצול עצמו
 * הוא אקט האישור — הסטטוס עובר ל-approved.
 */
export async function splitTransaction(
  sql: Sql,
  txnId: string,
  parts: SplitPart[],
  actor: string
) {
  if (parts.length < 2) {
    throw new Error("פיצול דורש לפחות שני חלקים — לתנועה רגילה השתמש באישור");
  }
  const clientIds = new Set(parts.map((p) => p.clientId));
  if (clientIds.size !== parts.length) {
    throw new Error("אותו לקוח מופיע פעמיים בפיצול — אחד את הסכומים");
  }
  for (const p of parts) {
    if (!Number.isFinite(p.amount) || p.amount <= 0) {
      throw new Error("כל חלק בפיצול חייב להיות סכום חיובי");
    }
  }

  return sql.begin(async (tx) => {
    const txn = await loadPendingTxn(tx, txnId, [
      "new",
      "needs_review",
      "matched",
    ]);
    await assertAfterCutoff(tx, txn.txnDate);

    // השוואה באגורות — לא סומכים על float
    const totalCents = parts.reduce(
      (s, p) => s + Math.round(p.amount * 100),
      0
    );
    const creditCents = Math.round(Number(txn.credit) * 100);
    if (totalCents !== creditCents) {
      throw new Error(
        `סכום החלקים (${(totalCents / 100).toFixed(2)}) חייב להיות שווה לסכום התנועה (${Number(txn.credit).toFixed(2)})`
      );
    }

    for (const p of parts) {
      const [client] = await tx`
        select id from clients where id = ${p.clientId}
      `;
      if (!client) throw new Error("לקוח בפיצול לא נמצא");
      await tx`
        insert into transaction_allocations (bank_transaction_id, client_id, amount)
        values (${txnId}, ${p.clientId}, ${p.amount})
      `;
    }

    const [updated] = await tx`
      update bank_transactions
      set status = 'approved',
          matched_client_id = null,
          match_confidence = 'exact',
          match_reason = ${"פוצל ידנית ל-" + parts.length + " לקוחות"}
      where id = ${txnId} returning *
    `;
    await writeAudit(tx, {
      actor,
      action: "payment_split",
      entity: "bank_transactions",
      entityId: txnId,
      after: {
        parts: parts.map((p) => ({ client_id: p.clientId, amount: p.amount })),
        total: Number(txn.credit),
      },
    });
    return updated;
  });
}

/**
 * ביטול אישור: מוחק את השיוכים ומחזיר את התנועה לתור.
 * מותר רק מ-approved (לא מ-issued — בשלב ב' זה יהיה מסמך זיכוי).
 */
export async function unapproveTransaction(
  sql: Sql,
  txnId: string,
  actor: string
) {
  return sql.begin(async (tx) => {
    const txn = await loadPendingTxn(tx, txnId, ["approved"]);
    const allocations = await tx`
      delete from transaction_allocations
      where bank_transaction_id = ${txnId}
      returning client_id, amount
    `;
    const [updated] = await tx`
      update bank_transactions
      set status = ${txn.matchedClientId ? "matched" : "needs_review"}
      where id = ${txnId} returning *
    `;
    await writeAudit(tx, {
      actor,
      action: "payment_unapprove",
      entity: "bank_transactions",
      entityId: txnId,
      before: {
        allocations: allocations.map((a) => ({
          client_id: a.clientId,
          amount: a.amount,
        })),
      },
    });
    return updated;
  });
}
