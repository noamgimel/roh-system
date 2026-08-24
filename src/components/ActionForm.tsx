"use client";

// עטיפה אחידה לטופסי server actions: שגיאה חוזרת כטוסט במקום להפיל
// את המסך, הצלחה מוצגת כטוסט ירוק, והטופס מושבת בזמן שליחה.

import { useTransition } from "react";
import { showToast } from "./toast/store";
import type { ActionResult } from "@/lib/action-result";

export default function ActionForm({
  action,
  children,
  className,
}: {
  action: (fd: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      className={className}
      // onSubmit ולא action: ריאקט מאפס טופס אחרי form action, וזה
      // מוחק את מה שהמשתמש הקליד בדיוק כשיש שגיאה. כאן הערכים נשמרים.
      // ולידציית required המובנית עדיין רצה לפני אירוע ה-submit.
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          try {
            const res = await action(fd);
            if (res?.error) showToast(res.error, "error");
            else if (res?.success) showToast(res.success, "success");
          } catch (err) {
            // redirect() ו-notFound() של Next מגיעים כ-throw עם digest
            // מיוחד — חייבים לזרוק אותם הלאה כדי שהניווט יקרה
            const digest =
              err && typeof err === "object" && "digest" in err
                ? String((err as { digest: unknown }).digest)
                : "";
            if (digest.startsWith("NEXT_")) throw err;
            showToast("שגיאה לא צפויה — נסה שוב", "error");
          }
        });
      }}
    >
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
    </form>
  );
}
