// טופס לקוח משותף ליצירה ולעריכה — קומפוננטת שרת, נשלח ל-server action
// דרך ActionForm כך ששגיאות (למשל ת"ז כפול) חוזרות כטוסט ולא מפילות מסך.

import ActionForm from "@/components/ActionForm";
import type { ActionResult } from "@/lib/action-result";

type ClientRow = Record<string, unknown>;

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  required = false,
  dir,
}: {
  label: string;
  name: string;
  defaultValue?: unknown;
  type?: string;
  required?: boolean;
  dir?: "ltr" | "rtl";
}) {
  return (
    <label className="block">
      <span className="block text-sm text-slate-600 mb-1">
        {label}
        {required && <span className="text-red-500 mr-1">*</span>}
      </span>
      <input
        type={type}
        name={name}
        required={required}
        dir={dir}
        step={type === "number" ? "0.01" : undefined}
        defaultValue={
          defaultValue === null || defaultValue === undefined
            ? ""
            : String(defaultValue)
        }
        className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </label>
  );
}

export default function ClientForm({
  action,
  client,
  submitLabel,
}: {
  action: (fd: FormData) => Promise<ActionResult>;
  client?: ClientRow;
  submitLabel: string;
}) {
  const c = client ?? {};
  return (
    <ActionForm action={action} className="space-y-8 max-w-3xl">
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="font-semibold mb-4">פרטים בסיסיים</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="שם" name="name" defaultValue={c.name} required />
          <Field label='ת"ז / ח"פ' name="taxId" defaultValue={c.taxId} required dir="ltr" />
          <Field label="תחום פעילות" name="activity" defaultValue={c.activity} />
          <label className="block">
            <span className="block text-sm text-slate-600 mb-1">סוג ישות</span>
            <select
              name="entityType"
              defaultValue={(c.entityType as string) ?? ""}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
            >
              <option value="">—</option>
              <option value="מורשה">מורשה</option>
              <option value="פטור">פטור</option>
              <option value="חברה">חברה</option>
            </select>
          </label>
          <Field label="טלפון" name="phone" defaultValue={c.phone} dir="ltr" />
          <Field label="אימייל" name="email" defaultValue={c.email} type="email" dir="ltr" />
        </div>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="font-semibold mb-4">חיוב ויתרה</h2>
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="block text-sm text-slate-600 mb-1">סוג לקוח</span>
            <select
              name="clientType"
              defaultValue={(c.clientType as string) ?? "קבוע"}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
            >
              <option value="קבוע">קבוע — חיוב חודשי אוטומטי</option>
              <option value="מזדמן">מזדמן — חיוב ידני בלבד</option>
            </select>
          </label>
          <Field
            label="תעריף חודשי (₪)"
            name="rate"
            defaultValue={c.rate}
            type="number"
            dir="ltr"
          />
          <Field
            label="יתרת פתיחה (₪)"
            name="openingBalance"
            defaultValue={c.openingBalance ?? 0}
            type="number"
            dir="ltr"
          />
          <label className="flex items-center gap-2 mt-6">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={c.isActive === undefined ? true : Boolean(c.isActive)}
              className="w-4 h-4"
            />
            <span className="text-sm">לקוח פעיל</span>
          </label>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="font-semibold mb-4">פרטי מיסוי ודיווח</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="תיק ניכויים" name="withholdingFile" defaultValue={c.withholdingFile} dir="ltr" />
          <Field label='תדירות מע"מ' name="vatFrequency" defaultValue={c.vatFrequency} />
          <Field label="102 ביטוח לאומי" name="ni102Frequency" defaultValue={c.ni102Frequency} />
          <Field label="102 מס הכנסה" name="tax102Frequency" defaultValue={c.tax102Frequency} />
          <Field label="שיעור מקדמות (%)" name="advancesRate" defaultValue={c.advancesRate} type="number" dir="ltr" />
          <Field label="תדירות מקדמות" name="advancesFrequency" defaultValue={c.advancesFrequency} />
          <Field label="הרשאות" name="permissions" defaultValue={c.permissions} />
        </div>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="font-semibold mb-4">בן/בת זוג והערות</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="שם בן/בת זוג" name="spouseName" defaultValue={c.spouseName} />
          <Field label='ת"ז בן/בת זוג' name="spouseTaxId" defaultValue={c.spouseTaxId} dir="ltr" />
        </div>
        <label className="block mt-4">
          <span className="block text-sm text-slate-600 mb-1">הערות</span>
          <textarea
            name="notes"
            defaultValue={(c.notes as string) ?? ""}
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
          />
        </label>
      </section>

      <div className="flex gap-3">
        <button className="px-6 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
          {submitLabel}
        </button>
      </div>
    </ActionForm>
  );
}
