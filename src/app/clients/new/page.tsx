import ClientForm from "@/components/ClientForm";
import BackLink from "@/components/BackLink";
import { createClientAction } from "../actions";

export default function NewClientPage() {
  return (
    <div>
      <BackLink href="/clients" label="רשימת הלקוחות" />
      <h1 className="text-2xl font-bold mb-6">לקוח חדש</h1>
      <ClientForm action={createClientAction} submitLabel="יצירת לקוח" />
    </div>
  );
}
