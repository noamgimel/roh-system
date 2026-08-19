import ClientForm from "@/components/ClientForm";
import { createClientAction } from "../actions";

export default function NewClientPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">לקוח חדש</h1>
      <ClientForm action={createClientAction} submitLabel="יצירת לקוח" />
    </div>
  );
}
