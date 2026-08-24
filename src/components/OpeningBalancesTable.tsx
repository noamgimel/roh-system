"use client";

// הזנת יתרות פתיחה ברצף: עריכה ישירה בשורה, שמירה אוטומטית ביציאה
// מהשדה, ו-Enter שומר וקופץ לשורה הבאה — בנוי להזנת ~30 יתרות בזאפ.

import { useRef, useState } from "react";
import { saveOpeningBalanceAction } from "@/app/(app)/opening-balances/actions";
import { showToast } from "@/components/toast/store";

export interface OpeningBalanceRow {
  id: string;
  name: string;
  clientType: string;
  taxId: string;
  openingBalance: string;
  balance: string;
}

type RowState = "idle" | "saving" | "saved" | "error";

function fmt(n: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(n);
}

export default function OpeningBalancesTable({
  rows,
}: {
  rows: OpeningBalanceRow[];
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, String(Number(r.openingBalance))]))
  );
  const [savedValues, setSavedValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, Number(r.openingBalance)]))
  );
  // היתרה הנוכחית מתעדכנת מקומית: משתנה בדיוק בהפרש שינוי הפתיחה
  const [balances, setBalances] = useState<Record<string, number>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, Number(r.balance)]))
  );
  const [states, setStates] = useState<Record<string, RowState>>({});
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  function setState(id: string, s: RowState) {
    setStates((prev) => ({ ...prev, [id]: s }));
  }

  async function commit(row: OpeningBalanceRow) {
    const raw = values[row.id]?.trim();
    const value = raw === "" || raw === "-" ? NaN : Number(raw);
    if (!Number.isFinite(value)) {
      setState(row.id, "error");
      showToast(`"${row.name}": הזן סכום מספרי`, "error");
      return;
    }
    if (value === savedValues[row.id]) return; // אין שינוי — אין שמירה

    setState(row.id, "saving");
    try {
      const res = await saveOpeningBalanceAction(row.id, value);
      if (res?.error) {
        setState(row.id, "error");
        showToast(`"${row.name}": ${res.error}`, "error");
        return;
      }
      const delta = value - savedValues[row.id];
      setSavedValues((prev) => ({ ...prev, [row.id]: value }));
      setBalances((prev) => ({ ...prev, [row.id]: prev[row.id] + delta }));
      setState(row.id, "saved");
    } catch {
      setState(row.id, "error");
      showToast(`"${row.name}": שגיאה בשמירה — נסה שוב`, "error");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key === "Enter") {
      e.preventDefault();
      // blur יפעיל את השמירה; ואז קפיצה לשורה הבאה
      (e.target as HTMLInputElement).blur();
      const next = inputRefs.current[index + 1];
      if (next) {
        next.focus();
        next.select();
      }
    }
  }

  const dirtyCount = rows.filter(
    (r) => Number(values[r.id]) !== savedValues[r.id] && values[r.id]?.trim() !== ""
  ).length;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-100 text-slate-600">
          <tr>
            <th className="text-right px-4 py-3 font-medium">לקוח</th>
            <th className="text-right px-4 py-3 font-medium">ת&quot;ז / ח&quot;פ</th>
            <th className="text-right px-4 py-3 font-medium">סוג</th>
            <th className="text-right px-4 py-3 font-medium w-44">
              יתרת פתיחה (₪)
            </th>
            <th className="text-right px-4 py-3 font-medium">יתרה נוכחית</th>
            <th className="w-16"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const state = states[row.id] ?? "idle";
            return (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium">{row.name}</td>
                <td className="px-4 py-2 tabular-nums text-right" dir="ltr">
                  {row.taxId}
                </td>
                <td className="px-4 py-2 text-slate-500">{row.clientType}</td>
                <td className="px-4 py-2">
                  <input
                    ref={(el) => {
                      inputRefs.current[i] = el;
                    }}
                    type="number"
                    step="0.01"
                    dir="ltr"
                    value={values[row.id] ?? ""}
                    onChange={(e) => {
                      setValues((prev) => ({ ...prev, [row.id]: e.target.value }));
                      setState(row.id, "idle");
                    }}
                    onBlur={() => commit(row)}
                    onKeyDown={(e) => handleKeyDown(e, i)}
                    onFocus={(e) => e.target.select()}
                    className={
                      "w-36 px-2 py-1.5 rounded-md border text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500 " +
                      (state === "error"
                        ? "border-red-400 bg-red-50"
                        : "border-slate-300")
                    }
                  />
                </td>
                <td className="px-4 py-2 tabular-nums font-medium">
                  {fmt(balances[row.id])}
                </td>
                <td className="px-2 py-2 text-center text-sm">
                  {state === "saving" && <span className="text-slate-400">…</span>}
                  {state === "saved" && <span className="text-green-600">✓</span>}
                  {state === "error" && <span className="text-red-600">✕</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="px-4 py-2.5 border-t border-slate-100 text-xs text-slate-500">
        Enter שומר וקופץ לשורה הבאה · יציאה מהשדה שומרת אוטומטית
        {dirtyCount > 0 && (
          <span className="text-amber-700"> · {dirtyCount} שינויים שטרם נשמרו</span>
        )}
      </div>
    </div>
  );
}
