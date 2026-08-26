"use client";

// מסך ייבוא האקסל: העלאה ← תצוגה מקדימה + דוח שגיאות ← אישור וייבוא.
// הקובץ לא נכתב ל-DB עד לאישור מפורש (כלל ברזל: המערכת לא סומכת על הקלט).

import { useState } from "react";
import Link from "next/link";
import BackLink from "@/components/BackLink";

interface PreviewData {
  fileName: string;
  headerRowNumber: number;
  columns: { index: number; header: string; field: string | null }[];
  unmappedHeaders: string[];
  totalRows: number;
  validCount: number;
  newCount: number;
  existingCount: number;
  existingNames: string[];
  failedRows: {
    rowNumber: number;
    name: string | null;
    errors: string[];
    data: Record<string, unknown>;
  }[];
  sample: Record<string, unknown>[];
}

interface ImportReport {
  totalRows: number;
  created: number;
  updated: number;
  skippedExisting: number;
  failed: {
    rowNumber: number;
    errors: string[];
    name: string | null;
    data: Record<string, unknown>;
  }[];
}

function manualCompletionHref(data: Record<string, unknown>): string {
  return `/clients/new?prefill=${encodeURIComponent(JSON.stringify(data))}`;
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
  // מה עושים עם לקוחות שכבר קיימים: ברירת מחדל — לדלג (לייבא רק חדשים)
  const [updateExisting, setUpdateExisting] = useState(false);

  async function post(url: string, f: File, extra?: Record<string, string>) {
    const fd = new FormData();
    fd.append("file", f);
    for (const [k, v] of Object.entries(extra ?? {})) fd.append(k, v);
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
      setUpdateExisting(false);
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
      setReport(
        await post("/api/import/commit", file, {
          updateExisting: updateExisting ? "1" : "0",
        })
      );
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
      <BackLink href="/clients" label="רשימת הלקוחות" />
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
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                <span className="text-slate-500">שורות בקובץ:</span>{" "}
                <b>{preview.totalRows}</b>
              </div>
              <div>
                <span className="text-slate-500">חדשים:</span>{" "}
                <b className="text-green-700">{preview.newCount}</b>
              </div>
              <div>
                <span className="text-slate-500">כבר קיימים במערכת:</span>{" "}
                <b className="text-blue-700">{preview.existingCount}</b>
              </div>
              <div>
                <span className="text-slate-500">עם שגיאות:</span>{" "}
                <b className="text-red-700">{preview.failedRows.length}</b>
              </div>
            </div>

            {preview.existingCount > 0 && (
              <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
                <div className="text-sm font-medium text-blue-900 mb-2">
                  {preview.existingCount} לקוחות מהקובץ כבר קיימים במערכת
                  {preview.existingNames.length > 0 && (
                    <span className="font-normal text-blue-800">
                      {" "}
                      ({preview.existingNames.slice(0, 5).join(", ")}
                      {preview.existingCount > 5 ? "…" : ""})
                    </span>
                  )}
                </div>
                <label className="flex items-center gap-2 text-sm text-blue-900">
                  <input
                    type="radio"
                    name="existingMode"
                    checked={!updateExisting}
                    onChange={() => setUpdateExisting(false)}
                  />
                  ייבא רק את החדשים — דלג על הקיימים (מומלץ)
                </label>
                <label className="flex items-center gap-2 text-sm text-blue-900 mt-1">
                  <input
                    type="radio"
                    name="existingMode"
                    checked={updateExisting}
                    onChange={() => setUpdateExisting(true)}
                  />
                  ייבא חדשים וגם עדכן את הקיימים מהקובץ
                </label>
              </div>
            )}

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
                    <th className="text-right pb-2 w-28"></th>
                  </tr>
                </thead>
                <tbody>
                  {preview.failedRows.map((r) => (
                    <tr key={r.rowNumber} className="border-t border-slate-100">
                      <td className="py-2">{r.rowNumber}</td>
                      <td className="py-2">{r.name ?? "—"}</td>
                      <td className="py-2 text-red-700">{r.errors.join("; ")}</td>
                      <td className="py-2">
                        {/* לשונית חדשה — לא מאבדים את תהליך הייבוא */}
                        <a
                          href={manualCompletionHref(r.data)}
                          target="_blank"
                          rel="noopener"
                          title="נפתח בלשונית חדשה — הייבוא כאן לא הולך לאיבוד"
                          className="text-xs text-blue-700 hover:underline whitespace-nowrap"
                        >
                          השלם ידנית ↗
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleCommit}
              disabled={
                busy ||
                (updateExisting ? preview.validCount : preview.newCount) === 0
              }
              className="px-6 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {updateExisting
                ? `ייבא ${preview.newCount} חדשים ועדכן ${preview.existingCount} קיימים`
                : `ייבא ${preview.newCount} לקוחות חדשים`}
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
            {report.skippedExisting > 0 && (
              <li className="text-slate-600">
                דולגו: <b>{report.skippedExisting}</b> לקוחות שכבר קיימים
              </li>
            )}
          </ul>
          {report.failed.length > 0 && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
              <div className="text-sm font-medium text-red-800 mb-2">
                {report.failed.length} שורות לא יובאו — אפשר להשלים ידנית:
              </div>
              <ul className="text-sm space-y-1">
                {report.failed.map((r) => (
                  <li key={r.rowNumber} className="flex items-center gap-2">
                    <span>
                      שורה {r.rowNumber} — {r.name ?? "ללא שם"}:{" "}
                      <span className="text-red-700">{r.errors.join("; ")}</span>
                    </span>
                    <a
                      href={manualCompletionHref(r.data)}
                      target="_blank"
                      rel="noopener"
                      className="text-xs text-blue-700 hover:underline whitespace-nowrap"
                    >
                      השלם ידנית ↗
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
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
