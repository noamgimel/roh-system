"use client";

// בחירת לקוח עם חיפוש — במקום <select> ארוך של עשרות לקוחות.
// מקלידים חלק מהשם או מהת"ז ← רשימה מסוננת ← בחירה בעכבר או במקלדת.
// מזין <input type="hidden" name={name}> כדי לעבוד בתוך טפסים רגילים.

import { useEffect, useMemo, useRef, useState } from "react";

export interface ClientOption {
  id: string;
  name: string;
  taxId?: string;
}

export default function ClientPicker({
  name,
  clients,
  defaultValue,
  value,
  onChange,
  placeholder = "חפש לקוח לפי שם או ת\"ז",
  required = false,
  className = "",
}: {
  name?: string;
  clients: ClientOption[];
  defaultValue?: string | null;
  value?: string | null; // מצב מבוקר (אופציונלי)
  onChange?: (id: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  const [localSelected, setLocalSelected] = useState<string>(defaultValue ?? "");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  // מבוקר (value מסופק) — ההורה הוא מקור האמת; אחרת מצב מקומי
  const selected = value !== undefined && value !== null ? value : localSelected;
  const selectedClient = clients.find((c) => c.id === selected) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients.slice(0, 50);
    const digits = q.replace(/\D/g, "");
    return clients
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (digits.length >= 3 && (c.taxId ?? "").includes(digits))
      )
      .slice(0, 50);
  }, [clients, query]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function choose(id: string) {
    setLocalSelected(id);
    onChange?.(id);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      {name && <input type="hidden" name={name} value={selected} required={required} />}
      <input
        type="text"
        value={open ? query : (selectedClient?.name ?? "")}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true);
          setQuery("");
          setActive(0);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (filtered[active]) choose(filtered[active].id);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className={
          "w-full px-2 py-1 rounded-md border bg-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 " +
          (selectedClient ? "border-blue-300 text-blue-900 font-medium" : "border-slate-300")
        }
      />
      {open && (
        <div className="absolute z-30 mt-1 w-64 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg text-sm right-0">
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-slate-400 text-xs">אין לקוח תואם</div>
          )}
          {filtered.map((c, i) => (
            <button
              type="button"
              key={c.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(c.id)}
              onMouseEnter={() => setActive(i)}
              className={
                "block w-full text-right px-3 py-1.5 text-xs " +
                (i === active ? "bg-blue-50 text-blue-900" : "hover:bg-slate-50") +
                (c.id === selected ? " font-bold" : "")
              }
            >
              {c.name}
              {c.taxId && (
                <span className="text-slate-400 mr-2" dir="ltr">
                  {c.taxId}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
