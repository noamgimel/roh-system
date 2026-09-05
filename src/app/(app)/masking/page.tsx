"use client";

// מסך כלי המיסוך — זמני לתקופת הפיתוח בלבד. יוסר לקראת העלייה לאוויר.

import { useState } from "react";

export default function MaskingPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function handleFile(f: File) {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/mask", { method: "POST", body: fd });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "שגיאה במיסוך");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `masked-${f.name}`;
      a.click();
      URL.revokeObjectURL(url);
      setDone(`הקובץ הממוסך ירד: masked-${f.name}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה במיסוך");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">מיסוך נתונים</h1>
      <div className="mb-4 max-w-2xl rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
        ⚠️ <b>כלי זמני לתקופת הפיתוח בלבד</b> — יוסר לקראת העלייה לאוויר.
      </div>
      <p className="text-sm text-slate-500 mb-6 max-w-2xl">
        מעלים קובץ אמיתי — אקסל לקוחות או CSV בנקאי — ומקבלים גרסה ממוסכת
        להורדה, באותו מבנה ובאותו קידוד. העיבוד מקומי בלבד: הקובץ לא נשמר
        בשום מקום ולא יוצא לשום שירות חיצוני. המיסוך עקבי — אותו ערך מקורי
        מקבל תמיד את אותו ערך בדוי, גם בין קבצים — כך שההתאמות נשמרות.
      </p>

      <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-2xl">
        <label className="block">
          <span className="block text-sm font-medium mb-2">
            קובץ למיסוך — דוח לקוחות או דף חשבון (xlsx / csv, הסוג מזוהה לבד)
          </span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
            className="block text-sm file:ml-4 file:px-4 file:py-2 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white file:text-sm file:cursor-pointer hover:file:bg-blue-700"
          />
        </label>
        {busy && <div className="mt-3 text-sm text-slate-500">ממסך…</div>}
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

      <div className="mt-6 max-w-2xl text-xs text-slate-500 space-y-1">
        <p><b>מה ממוסך:</b> שמות (כולל בני זוג ומשלמים), ת&quot;ז/ח&quot;פ (עם ספרת ביקורת תקינה), תיקי רשויות, טלפון, אימייל, בנק-סניף-חשבון.</p>
        <p><b>מה נשאר כמו במקור:</b> סכומים, תאריכים, יתרות, אסמכתאות, כותרות, מבנה וקידוד — בדיוק מה שנחוץ לכיול.</p>
      </div>
    </div>
  );
}
