import type { Sql, TransactionSql } from "postgres";
import { normalizeName, partialNameMatch } from "./normalize";
import { writeAudit } from "@/lib/audit";

// מנוע ההתאמה (סעיף 7 באפיון) — עוצרים בהתאמה הראשונה:
// 1. bank_key קיים ב-payers עם קישור יחיד  → exact, אוטומטי
// 2. bank_key מקושר לכמה לקוחות            → תור ידני תמיד
// 3. שם מנורמל תואם שם לקוח או בן/בת זוג   → high, דורש אישור
// 4. תאימות חלקית + סכום תואם חיוב פתוח    → medium, דורש אישור
// 5. ללא התאמה                              → תור ידני
//
// טבלת הכינויים הלומדת: כל אישור ידני כותב שורה ל-payer_clients עם
// confirmed_at. מהפעם הבאה אותו bank_key מזוהה אוטומטית (קריטריון 4).
// ביום הראשון הטבלה ריקה — ההתכנסות לאוטומציה לוקחת שבועות.

export interface MatchResult {
  clientId: string | null;
  confidence: "exact" | "high" | "medium" | "none";
  reason: string;
  status: "matched" | "needs_review" | "new";
}

interface ClientRow {
  id: string;
  name: string;
  spouseName: string | null;
  balance: string | null;
}

interface TxnRow {
  id: string;
  credit: string;
  parsedPayerName: string | null;
  parsedBankKey: string | null;
  parsedPayerAccount: string | null;
}

/** משלם מוכר (לפי חשבון או לפי ת"ז) → הכרעה לפי מספר הקישורים שלו */
async function knownPayerResult(
  sql: Sql | TransactionSql,
  payerId: string,
  via: string
): Promise<MatchResult | null> {
  const links = await sql`
    select client_id from payer_clients where payer_id = ${payerId}
  `;
  if (links.length === 1) {
    return {
      clientId: links[0].clientId as string,
      confidence: "exact",
      reason: `${via} מוכר עם קישור יחיד`,
      status: "matched",
    };
  }
  if (links.length > 1) {
    return {
      clientId: null,
      confidence: "none",
      reason: `המשלם מקושר ל-${links.length} לקוחות — נדרשת הכרעה ידנית`,
      status: "needs_review",
    };
  }
  return null;
}

async function evaluate(
  sql: Sql | TransactionSql,
  txn: TxnRow,
  clients: ClientRow[]
): Promise<MatchResult> {
  // כללים 1+2 — משלם שכבר נלמד: לפי חשבון בנק או לפי ת"ז
  if (txn.parsedBankKey) {
    const payers = await sql`
      select id from payers where bank_key = ${txn.parsedBankKey}
    `;
    if (payers.length > 0) {
      const r = await knownPayerResult(sql, payers[0].id as string, "חשבון משלם");
      if (r) return r;
    }
  }
  if (txn.parsedPayerAccount) {
    const payers = await sql`
      select id from payers where account_no = ${txn.parsedPayerAccount}
    `;
    if (payers.length > 0) {
      const r = await knownPayerResult(sql, payers[0].id as string, "חשבון משלם (מח-ן)");
      if (r) return r;
    }
  }

  if (txn.parsedPayerName) {
    const payerNorm = normalizeName(txn.parsedPayerName);

    // כלל 3 — שם מנורמל תואם שם לקוח או בן/בת זוג
    const nameMatches = clients.filter(
      (c) =>
        normalizeName(c.name) === payerNorm ||
        (c.spouseName && normalizeName(c.spouseName) === payerNorm)
    );
    if (nameMatches.length === 1) {
      return {
        clientId: nameMatches[0].id,
        confidence: "high",
        reason: "שם המשלם תואם את שם הלקוח או בן/בת הזוג",
        status: "needs_review",
      };
    }
    if (nameMatches.length > 1) {
      return {
        clientId: null,
        confidence: "none",
        reason: `${nameMatches.length} לקוחות עם שם זהה — נדרשת הכרעה ידנית`,
        status: "needs_review",
      };
    }

    // כלל 4 — תאימות חלקית + סכום שתואם חיוב פתוח
    const partial: ClientRow[] = [];
    for (const c of clients) {
      const nameHit =
        partialNameMatch(txn.parsedPayerName, c.name) ||
        (c.spouseName && partialNameMatch(txn.parsedPayerName, c.spouseName));
      if (!nameHit) continue;
      if (Number(c.balance ?? 0) <= 0) continue;
      const charge = await sql`
        select 1 from charges
        where client_id = ${c.id} and amount = ${txn.credit} limit 1
      `;
      if (charge.length > 0) partial.push(c);
    }
    if (partial.length === 1) {
      return {
        clientId: partial[0].id,
        confidence: "medium",
        reason: "תאימות חלקית של שם + סכום התואם חיוב פתוח",
        status: "needs_review",
      };
    }
  }

  // כלל 5 — ללא התאמה
  return {
    clientId: null,
    confidence: "none",
    reason: "לא נמצאה התאמה",
    status: "new",
  };
}

export interface MatchingReport {
  evaluated: number;
  matchedExact: number;
  suggested: number; // high/medium — ממתין לאישור
  queued: number; // ללא התאמה או דו-משמעי
}

/**
 * הרצת המנוע על כל התנועות הפתוחות (new / needs_review).
 * לעולם לא נוגע בתנועות מאושרות, מותאמות-ידנית, מונפקות או מוחרגות.
 */
export async function runMatching(
  sql: Sql,
  opts: { actor: string }
): Promise<MatchingReport> {
  return sql.begin(async (tx) => {
    const txns = await tx`
      select id, credit, parsed_payer_name, parsed_bank_key, parsed_payer_account
      from bank_transactions
      where status in ('new', 'needs_review')
      order by txn_date, created_at
    `;
    const clients = await tx`
      select c.id, c.name, c.spouse_name, b.balance
      from clients c
      left join client_balances b on b.id = c.id
      where c.is_active
    `;

    const report: MatchingReport = {
      evaluated: txns.length,
      matchedExact: 0,
      suggested: 0,
      queued: 0,
    };

    for (const t of txns) {
      const result = await evaluate(
        tx,
        t as unknown as TxnRow,
        clients as unknown as ClientRow[]
      );
      await tx`
        update bank_transactions
        set matched_client_id = ${result.clientId},
            match_confidence = ${result.confidence},
            match_reason = ${result.reason},
            status = ${result.status}
        where id = ${t.id as string}
      `;
      if (result.status === "matched") report.matchedExact++;
      else if (result.clientId) report.suggested++;
      else report.queued++;
    }

    if (txns.length > 0) {
      await writeAudit(tx, {
        actor: opts.actor,
        action: "match_run",
        entity: "bank_transactions",
        after: report as unknown as Record<string, unknown>,
      });
    }
    return report;
  });
}

/**
 * אישור ידני של התאמה — לב טבלת הכינויים הלומדת.
 * מקשר את התנועה ללקוח, ואם יש bank_key — כותב/מעדכן משלם וקישור
 * מאושר, כך שהקליטה הבאה מאותו חשבון תזוהה אוטומטית.
 */
export async function confirmMatch(
  sql: Sql,
  txnId: string,
  clientId: string,
  actor: string
) {
  return sql.begin(async (tx) => {
    const [txn] = await tx`
      select * from bank_transactions where id = ${txnId}
    `;
    if (!txn) throw new Error("תנועה לא נמצאה");
    if (!["new", "needs_review", "matched"].includes(txn.status as string)) {
      throw new Error(`אי אפשר להתאים תנועה בסטטוס "${txn.status}"`);
    }
    const [client] = await tx`
      select id, name from clients where id = ${clientId}
    `;
    if (!client) throw new Error("לקוח לא נמצא");

    const [updated] = await tx`
      update bank_transactions
      set matched_client_id = ${clientId},
          match_confidence = 'exact',
          match_reason = 'אישור ידני',
          status = 'matched'
      where id = ${txnId}
      returning *
    `;

    // למידה: לפי בנק-סניף-חשבון ו/או מספר חשבון (מח-ן) — שם לבדו אינו מפתח אמין
    const bankKey = (txn.parsedBankKey as string | null) ?? null;
    const payerAccount = (txn.parsedPayerAccount as string | null) ?? null;
    if (bankKey || payerAccount) {
      const existing = await tx`
        select id, bank_key, account_no from payers
        where (${bankKey}::text is not null and bank_key = ${bankKey})
           or (${payerAccount}::text is not null and account_no = ${payerAccount})
        limit 1
      `;
      let payerId: string;
      if (existing.length > 0) {
        payerId = existing[0].id as string;
        // משלימים מפתח שחסר למשלם קיים (למשל נלמד לפי ת"ז ועכשיו הגיע גם חשבון)
        await tx`
          update payers
          set bank_key = coalesce(bank_key, ${bankKey}),
              account_no = coalesce(account_no, ${payerAccount}),
              display_name = coalesce(${txn.parsedPayerName as string | null}, display_name)
          where id = ${payerId}
        `;
      } else {
        const [created] = await tx`
          insert into payers (display_name, bank_key, account_no)
          values (${txn.parsedPayerName ?? "משלם ללא שם"}, ${bankKey}, ${payerAccount})
          returning id
        `;
        payerId = created.id as string;
      }
      await tx`
        insert into payer_clients (payer_id, client_id, confirmed_at)
        values (${payerId}, ${clientId}, now())
        on conflict (payer_id, client_id) do update set confirmed_at = now()
      `;
    }

    await writeAudit(tx, {
      actor,
      action: "match_confirm",
      entity: "bank_transactions",
      entityId: txnId,
      before: {
        matched_client_id: txn.matchedClientId,
        status: txn.status,
        match_confidence: txn.matchConfidence,
      },
      after: {
        matched_client_id: clientId,
        client_name: client.name,
        learned_bank_key: txn.parsedBankKey ?? null,
        learned_account: txn.parsedPayerAccount ?? null,
      },
    });
    return updated;
  });
}

/** ביטול התאמה — התנועה חוזרת לתור. אינו מוחק כינויים שנלמדו. */
export async function clearMatch(sql: Sql, txnId: string, actor: string) {
  return sql.begin(async (tx) => {
    const [txn] = await tx`
      select * from bank_transactions where id = ${txnId}
    `;
    if (!txn) throw new Error("תנועה לא נמצאה");
    if (!["matched", "needs_review"].includes(txn.status as string)) {
      throw new Error(`אי אפשר לבטל התאמה בסטטוס "${txn.status}"`);
    }
    const [updated] = await tx`
      update bank_transactions
      set matched_client_id = null,
          match_confidence = null,
          match_reason = null,
          status = 'new'
      where id = ${txnId}
      returning *
    `;
    await writeAudit(tx, {
      actor,
      action: "match_clear",
      entity: "bank_transactions",
      entityId: txnId,
      before: {
        matched_client_id: txn.matchedClientId,
        status: txn.status,
      },
    });
    return updated;
  });
}
