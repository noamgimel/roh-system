"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "שגיאה בהתחברות");
        return;
      }
      router.replace("/clients");
      router.refresh();
    } catch {
      setError("שגיאת תקשורת — נסה שוב");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">ניהול לקוחות ויתרות</h1>
          <p className="text-sm text-slate-500 mt-1">משרד רו&quot;ח</p>
        </div>
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl border border-slate-200 p-6 space-y-4"
        >
          <label className="block">
            <span className="block text-sm text-slate-600 mb-1">אימייל</span>
            <input
              type="email"
              required
              autoFocus
              dir="ltr"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <label className="block">
            <span className="block text-sm text-slate-600 mb-1">סיסמה</span>
            <input
              type="password"
              required
              dir="ltr"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          <button
            disabled={busy}
            className="w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "מתחבר…" : "התחברות"}
          </button>
        </form>
        <p className="text-center text-xs text-slate-400 mt-4">
          כל ניסיון התחברות מתועד ביומן הביקורת
        </p>
      </div>
    </div>
  );
}
