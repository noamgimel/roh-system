"use client";

import { useSyncExternalStore } from "react";
import { subscribeToasts, getToasts, dismissToast } from "./store";

// RTL: פס ההדגשה בצד ימין
const STYLES: Record<string, string> = {
  error: "bg-red-50 border-red-300 text-red-900 border-r-4 border-r-red-600",
  success:
    "bg-green-50 border-green-300 text-green-900 border-r-4 border-r-green-600",
  info: "bg-blue-50 border-blue-300 text-blue-900 border-r-4 border-r-blue-600",
};

const EMPTY: never[] = []; // snapshot יציב ל-SSR — מונע אזהרת לולאה

export default function Toaster() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts, () => EMPTY);

  if (toasts.length === 0) return null;
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] space-y-2 w-full max-w-md px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="alert"
          className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg ${STYLES[t.type]}`}
        >
          <span>{t.message}</span>
          <button
            onClick={() => dismissToast(t.id)}
            className="shrink-0 opacity-60 hover:opacity-100"
            aria-label="סגור"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
