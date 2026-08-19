"use client";

// העלאת דף חשבון: קובץ ← מסך ביניים ("בקובץ X תנועות, Y חדשות,
// Z כבר טופלו, W הוחרגו") ← אישור ← קליטה. כלל ברזל 4.

import { useState } from "react";
import { useRouter } from "next/navigation";

interface PreviewRow {
  rowNumber: number;
  txnDate: string;
  description: string | null;
  details: string | null;
  credit: string;
  disposition: "new" | "duplicate" | "ignored";
  ignoredReason: string | null;
  payerName: string | null;
  bankKey: string | null;
  purpose: string | null;
}

interface Preview {
  fileName: string;
  encoding: string;
  rangeFrom: string | null;
  rangeTo: string | null;
  rowsTotal: number;
  rowsNew: number;
  rowsDuplicate: number;
  rowsIgnored: number;
  debitRowsFiltered: number;
  skippedRows: { rowNumber: number; reason: string }[];
  rows: PreviewRow[];
}

const DISPOSITION_LABEL: Record<string, { text: string; cls: string }> = {
  new: { text: "חדשה", cls: "bg-green-100 text-green-800" },
  duplicate: { text: "כבר טופלה", cls: "bg-slate-200 text-slate-600" },
  ignored: { text: "מוחרגת", cls: "bg-amber-100 text-amber-800" },
};

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function BankUpload() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function post(url: string, f: File) {
    const fd = new FormData();
    fd.append("file", f);
    const res = await fetch(url, { method: "POST", body: fd });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "שגיאה לא צפויה");
    return json.data;
  }

  async function handleFile(f: File) {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      setPreview(await post("/api/bank/preview", f));
      setFile(f);
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : "שגיאה בפענוח");
    } finally {
      setBusy(false);
    }
  }

  async function handleCommit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const report = await post("/api/bank/commit", file);
      setDone(
        `נקלטו ${report.rowsNew} תנועות חדשות, ${report.rowsIgnored} הוחרגו, ${report.rowsDuplicate} זוהו כמטופלות`
      );
      setPreview(null);
      setFile(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בקליטה");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-2xl">
        <label className="block">
          <span className="block text-sm font-medium mb-2">
            קובץ CSV מייצוא תנועות החשבון (בנק הפועלים)
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
            className="block text-sm file:ml-4 file:px-4 file:py-2 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white file:text-sm file:cursor-pointer hover:file:bg-blue-700"
          />
        </label>
        {busy && <div className="mt-3 text-sm text-slate-500">מעבד…</div>}
        {error && (
          <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        {done && (
          <div className="mt-3 text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            {done}
          </div>
        )}
      </div>

      {preview && (
        <div className="space-y-4 max-w-4xl">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
            <div className="font-semibold text-blue-900 mb-1">
              מסך ביניים — שום דבר עוד לא נקלט
            </div>
            <div className="text-sm text-blue-900">
              בקובץ <b>{preview.rowsTotal}</b> תנועות זכות
              {preview.rangeFrom && preview.rangeTo && (
                <>
                  {" "}({fmtDate(preview.rangeFrom)} – {fmtDate(preview.rangeTo)})
                </>
              )}
              : <b>{preview.rowsNew}</b> חדשות · <b>{preview.rowsDuplicate}</b>{" "}
              כבר טופלו · <b>{preview.rowsIgnored}</b> הוחרגו אוטומטית ·{" "}
              {preview.debitRowsFiltered} שורות חובה סוננו
              {preview.encoding === "windows-1255" && " · קידוד: windows-1255"}
            </div>
          </div>

          {preview.skippedRows.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
              <b>{preview.skippedRows.length} שורות לא נקראו:</b>{" "}
              {preview.skippedRows
                .map((s) => `שורה ${s.rowNumber} (${s.reason})`)
                .join(", ")}
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="text-right px-3 py-2 font-medium">תאריך</th>
                  <th className="text-right px-3 py-2 font-medium">תיאור</th>
                  <th className="text-right px-3 py-2 font-medium">משלם</th>
                  <th className="text-right px-3 py-2 font-medium">סכום</th>
                  <th className="text-right px-3 py-2 font-medium">סיווג</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => {
                  const d = DISPOSITION_LABEL[r.disposition];
                  return (
                    <tr key={r.rowNumber} className="border-t border-slate-100">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {fmtDate(r.txnDate)}
                      </td>
                      <td className="px-3 py-2">{r.description ?? "—"}</td>
                      <td className="px-3 py-2 max-w-md">
                        {r.payerName ? (
                          <span title={r.details ?? undefined}>
                            {r.payerName}
                            {r.bankKey && (
                              <span
                                className="text-xs text-slate-400 mr-1"
                                dir="ltr"
                              >
                                ({r.bankKey})
                              </span>
                            )}
                          </span>
                        ) : (
                          <span
                            className="text-slate-400"
                            title={r.details ?? undefined}
                          >
                            לא זוהה משלם
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                        ₪{Number(r.credit).toLocaleString("he-IL")}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs ${d.cls}`}
                          title={r.ignoredReason ?? undefined}
                        >
                          {d.text}
                          {r.ignoredReason ? ` — ${r.ignoredReason}` : ""}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleCommit}
              disabled={busy || preview.rowsNew + preview.rowsIgnored === 0}
              className="px-6 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              אישור וקליטת {preview.rowsNew + preview.rowsIgnored} תנועות
            </button>
            <button
              onClick={() => {
                setPreview(null);
                setFile(null);
              }}
              disabled={busy}
              className="px-6 py-2.5 rounded-lg border border-slate-300 bg-white text-sm hover:bg-slate-100"
            >
              ביטול
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
