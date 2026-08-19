"use client";

// מסך ייבוא האקסל: העלאה ← תצוגה מקדימה + דוח שגיאות ← אישור וייבוא.
// הקובץ לא נכתב ל-DB עד לאישור מפורש (כלל ברזל: המערכת לא סומכת על הקלט).

import { useState } from "react";
import Link from "next/link";

interface PreviewData {
  fileName: string;
  headerRowNumber: number;
  columns: { index: number; header: string; field: string | null }[];
  unmappedHeaders: string[];
  totalRows: number;
  validCount: number;
  failedRows: { rowNumber: number; name: string | null; errors: string[] }[];
  sample: Record<string, unknown>[];
}

interface ImportReport {
  totalRows: number;
  created: number;
  updated: number;
  failed: { rowNumber: number; errors: string[] }[];
}

const FIELD_LABELS: Record<string, string> = {
  client_no: "מספר לקוח",
  tax_id: 'ת"ז / ח"פ',
  name: "שם",
  activity: "פעילות",
  entity_type: "סוג ישות",
  withholding_file: "תיק ניכויים",
  spouse_name: "בן/בת זוג",
  spouse_tax_id: 'ת"ז בן/בת זוג',
  vat_frequency: 'תדירות מע"מ',
  ni_102_frequency: "102 ביטוח לאומי",
  tax_102_frequency: "102 מס הכנסה",
  advances_rate: "שיעור מקדמות",
  advances_frequency: "תדירות מקדמות",
  permissions: "הרשאות",
  phone: "טלפון",
  email: "אימייל",
  is_active: "סטטוס",
};

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function post(url: string, f: File) {
    const fd = new FormData();
    fd.append("file", f);
    const res = await fetch(url, { method: "POST", body: fd });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "שגיאה לא צפויה");
    return json.data;
  }

  async function handlePreview(f: File) {
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      setPreview(await post("/api/import/preview", f));
      setFile(f);
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : "שגיאה בפענוח הקובץ");
    } finally {
      setBusy(false);
    }
  }

  async function handleCommit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setReport(await post("/api/import/commit", file));
      setPreview(null);
      setFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בייבוא");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">ייבוא לקוחות מאקסל</h1>
      <p className="text-sm text-slate-500 mb-6 max-w-2xl">
        האקסל של המשרד הוא מקור האמת — המערכת מייבאת ומייצאת, לא מחליפה.
        לקוח קיים (לפי ת&quot;ז/ח&quot;פ) יעודכן; לקוח חדש ייווצר. תעריף, יתרת
        פתיחה וסוג לקוח שהוגדרו במערכת אינם נדרסים בייבוא.
      </p>

      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6 max-w-2xl">
        <label className="block">
          <span className="block text-sm font-medium mb-2">קובץ אקסל (.xlsx)</span>
          <input
            type="file"
            accept=".xlsx"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handlePreview(f);
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
      </div>

      {preview && (
        <div className="space-y-6 max-w-4xl">
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="font-semibold mb-3">תצוגה מקדימה — {preview.fileName}</h2>
            <div className="flex gap-6 text-sm">
              <div>
                <span className="text-slate-500">שורות בקובץ:</span>{" "}
                <b>{preview.totalRows}</b>
              </div>
              <div>
                <span className="text-slate-500">תקינות לייבוא:</span>{" "}
                <b className="text-green-700">{preview.validCount}</b>
              </div>
              <div>
                <span className="text-slate-500">עם שגיאות:</span>{" "}
                <b className="text-red-700">{preview.failedRows.length}</b>
              </div>
            </div>

            <div className="mt-4">
              <h3 className="text-sm font-medium mb-2">מיפוי עמודות</h3>
              <div className="flex flex-wrap gap-1.5">
                {preview.columns.map((c) => (
                  <span
                    key={c.index}
                    className={
                      "px-2 py-1 rounded text-xs " +
                      (c.field
                        ? "bg-blue-50 text-blue-800 border border-blue-200"
                        : "bg-amber-50 text-amber-800 border border-amber-200")
                    }
                    title={c.field ? FIELD_LABELS[c.field] : "לא ממופה — לא ייובא"}
                  >
                    {c.header}
                    {c.field ? ` ← ${FIELD_LABELS[c.field]}` : " (לא ממופה)"}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {preview.failedRows.length > 0 && (
            <div className="bg-white rounded-xl border border-red-200 p-6">
              <h3 className="font-semibold text-red-800 mb-3">
                דוח שגיאות — השורות האלה לא ייובאו
              </h3>
              <table className="w-full text-sm">
                <thead className="text-slate-500 text-xs">
                  <tr>
                    <th className="text-right pb-2 w-20">שורה</th>
                    <th className="text-right pb-2 w-48">שם</th>
                    <th className="text-right pb-2">שגיאות</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.failedRows.map((r) => (
                    <tr key={r.rowNumber} className="border-t border-slate-100">
                      <td className="py-2">{r.rowNumber}</td>
                      <td className="py-2">{r.name ?? "—"}</td>
                      <td className="py-2 text-red-700">{r.errors.join("; ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleCommit}
              disabled={busy || preview.validCount === 0}
              className="px-6 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              אישור וייבוא {preview.validCount} לקוחות
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

      {report && (
        <div className="bg-white rounded-xl border border-green-200 p-6 max-w-2xl">
          <h2 className="font-semibold text-green-800 mb-3">הייבוא הושלם</h2>
          <ul className="text-sm space-y-1">
            <li>נוצרו: <b>{report.created}</b> לקוחות חדשים</li>
            <li>עודכנו: <b>{report.updated}</b> לקוחות קיימים</li>
            {report.failed.length > 0 && (
              <li className="text-red-700">
                נכשלו: <b>{report.failed.length}</b> שורות (ראה דוח שגיאות למעלה)
              </li>
            )}
          </ul>
          <Link
            href="/clients"
            className="inline-block mt-4 px-4 py-2 rounded-lg bg-slate-800 text-white text-sm hover:bg-slate-700"
          >
            למסך הלקוחות
          </Link>
        </div>
      )}
    </div>
  );
}
