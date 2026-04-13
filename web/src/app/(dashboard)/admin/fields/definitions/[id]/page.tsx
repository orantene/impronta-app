import { redirect } from "next/navigation";

export default async function AdminFieldDefinitionEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin/fields?edit=${encodeURIComponent(id)}`);
}

