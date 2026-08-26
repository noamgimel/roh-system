"use client";

// גלגלת עכבר מעל שדה מספר בפוקוס משנה את הערך בשקט (1600 → 1599.97
// אחרי שלוש נקישות גלילה). מנטרלים גלובלית: גלילה מעל שדה מספר
// ממוקד משחררת את הפוקוס, והדף נגלל כרגיל.

import { useEffect } from "react";

export default function NumberInputGuard() {
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement &&
        el.type === "number" &&
        e.target === el
      ) {
        el.blur();
      }
    };
    document.addEventListener("wheel", onWheel, { passive: true });
    return () => document.removeEventListener("wheel", onWheel);
  }, []);
  return null;
}
