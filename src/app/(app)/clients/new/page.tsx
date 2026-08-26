import ClientForm from "@/components/ClientForm";
import BackLink from "@/components/BackLink";
import { createClientAction } from "../actions";

// מיפוי שדות שורת האקסל (snake_case) לשדות הטופס — למילוי מראש
// כשמגיעים מ"השלם ידנית" בדוח השגיאות של הייבוא
const PREFILL_MAP: Record<string, string> = {
  tax_id: "taxId",
  name: "name",
  activity: "activity",
  entity_type: "entityType",
  withholding_file: "withholdingFile",
  spouse_name: "spouseName",
  spouse_tax_id: "spouseTaxId",
  vat_frequency: "vatFrequency",
  ni_102_frequency: "ni102Frequency",
  tax_102_frequency: "tax102Frequency",
  advances_rate: "advancesRate",
  advances_frequency: "advancesFrequency",
  permissions: "permissions",
  phone: "phone",
  email: "email",
  is_active: "isActive",
};

function parsePrefill(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const data = JSON.parse(raw);
    if (typeof data !== "object" || data === null) return {};
    const client: Record<string, unknown> = {};
    for (const [snake, camel] of Object.entries(PREFILL_MAP)) {
      const v = (data as Record<string, unknown>)[snake];
      if (v !== null && v !== undefined && v !== "") client[camel] = v;
    }
    return client;
  } catch {
    return {}; // prefill פגום — פשוט טופס ריק
  }
}

export default async function NewClientPage({
  searchParams,
}: {
  searchParams: Promise<{ prefill?: string }>;
}) {
  const { prefill } = await searchParams;
  const client = parsePrefill(prefill);
  const hasPrefill = Object.keys(client).length > 0;

  return (
    <div>
      <BackLink href="/clients" label="רשימת הלקוחות" />
      <h1 className="text-2xl font-bold mb-2">לקוח חדש</h1>
      {hasPrefill && (
        <p className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-900 max-w-3xl">
          השדות מולאו מתוך שורת האקסל שנכשלה — השלם את מה שחסר
          {"taxId" in client ? "" : ' (בדרך כלל ת"ז/ח"פ)'} ושמור.
        </p>
      )}
      <ClientForm action={createClientAction} client={client} submitLabel="יצירת לקוח" />
    </div>
  );
}
