"use client";

// פיצול תשלום מרוכז: תנועה אחת ← כמה לקוחות. סכום החלקים חייב
// להיות שווה בדיוק לסכום התנועה; הפיצול הוא אקט האישור.

import { useState } from "react";
import { splitAction } from "@/app/(app)/queue/actions";

interface ClientOption {
  id: string;
  name: string;
}

interface Part {
  clientId: string;
  amount: string;
}

export default function SplitDialog({
  txnId,
  credit,
  clients,
}: {
  txnId: string;
  credit: string;
  clients: ClientOption[];
}) {
  const [open, setOpen] = useState(false);
  const [parts, setParts] = useState<Part[]>([
    { clientId: "", amount: "" },
    { clientId: "", amount: "" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const total = Number(credit);
  const sum = parts.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const remainder = Math.round((total - sum) * 100) / 100;

  function setPart(i: number, patch: Partial<Part>) {
    setParts((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await splitAction(
        txnId,
        parts.map((p) => ({ clientId: p.clientId, amount: Number(p.amount) }))
      );
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בפיצול");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-slate-500 hover:text-slate-800 underline"
      >
        פצל
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl">
        <h3 className="font-bold mb-1">פיצול תשלום מרוכז</h3>
        <p className="text-sm text-slate-500 mb-4">
          סכום התנועה: ₪{total.toLocaleString("he-IL")} — חלק אותו בין
          הלקוחות. הפיצול מאשר את התשלום ורושם אותו מול היתרות.
        </p>

        <div className="space-y-2">
          {parts.map((p, i) => (
            <div key={i} className="flex gap-2 items-center">
              <select
                value={p.clientId}
                onChange={(e) => setPart(i, { clientId: e.target.value })}
                className="flex-1 px-2 py-1.5 rounded-md border border-slate-300 text-sm"
              >
                <option value="">— בחר לקוח —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.01"
                min="0.01"
                dir="ltr"
                placeholder="סכום"
                value={p.amount}
                onChange={(e) => setPart(i, { amount: e.target.value })}
                className="w-28 px-2 py-1.5 rounded-md border border-slate-300 text-sm text-right"
              />
              {parts.length > 2 && (
                <button
                  onClick={() => setParts((ps) => ps.filter((_, j) => j !== i))}
                  className="text-slate-400 hover:text-red-600"
                  title="הסר חלק"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between mt-3">
          <button
            onClick={() => setParts((ps) => [...ps, { clientId: "", amount: "" }])}
            className="text-xs text-blue-700 hover:underline"
          >
            + הוסף חלק
          </button>
          <div
            className={
              "text-sm tabular-nums " +
              (remainder === 0 ? "text-green-700" : "text-amber-700")
            }
          >
            {remainder === 0
              ? "הסכומים מאוזנים ✓"
              : `נותר לחלק: ₪${remainder.toLocaleString("he-IL")}`}
          </div>
        </div>

        {error && (
          <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex gap-3 mt-5">
          <button
            onClick={submit}
            disabled={
              busy ||
              remainder !== 0 ||
              parts.some((p) => !p.clientId || !p.amount)
            }
            className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            פצל ואשר
          </button>
          <button
            onClick={() => setOpen(false)}
            disabled={busy}
            className="px-5 py-2 rounded-lg border border-slate-300 text-sm hover:bg-slate-100"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
