"use client";

// חנות טוסטים מינימלית — בלי תלות חיצונית.
// showToast נקרא מכל קומפוננטת client; Toaster מציג ומנקה.

export interface ToastItem {
  id: number;
  message: string;
  type: "error" | "success" | "info";
}

let toasts: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function showToast(
  message: string,
  type: ToastItem["type"] = "info",
  durationMs = 4500
) {
  const id = nextId++;
  toasts = [...toasts, { id, message, type }];
  emit();
  setTimeout(() => dismissToast(id), durationMs);
}

export function dismissToast(id: number) {
  const before = toasts.length;
  toasts = toasts.filter((t) => t.id !== id);
  if (toasts.length !== before) emit();
}

export function subscribeToasts(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getToasts(): ToastItem[] {
  return toasts;
}
