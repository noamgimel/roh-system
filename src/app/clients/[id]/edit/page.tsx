import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { getClient } from "@/lib/clients/repo";
import ClientForm from "@/components/ClientForm";
import BackLink from "@/components/BackLink";
import { updateClientAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await getClient(sql, id);
  if (!client) notFound();

  const action = updateClientAction.bind(null, id);

  return (
    <div>
      <BackLink href={`/clients/${id}`} label="כרטיס הלקוח" />
      <h1 className="text-2xl font-bold mb-6">עריכת לקוח — {client.name as string}</h1>
      <ClientForm action={action} client={client} submitLabel="שמירת שינויים" />
    </div>
  );
}
