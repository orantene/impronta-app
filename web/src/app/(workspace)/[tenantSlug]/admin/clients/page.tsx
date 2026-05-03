// Phase 3 — canonical workspace Clients page.
// Server Component — no "use client".

import { notFound } from "next/navigation";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { loadWorkspaceClients } from "../../_data-bridge";
import { ClientsClientShell } from "./ClientsClientShell";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

export default async function WorkspaceClientsPage({
  params,
}: {
  params: PageParams;
}) {
  const { tenantSlug } = await params;

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const canView = await userHasCapability("agency.workspace.view", scope.tenantId);
  if (!canView) notFound();

  const [canEdit, clients] = await Promise.all([
    userHasCapability("agency.roster.edit", scope.tenantId),
    loadWorkspaceClients(scope.tenantId),
  ]);

  return (
    <ClientsClientShell
      clients={clients}
      tenantSlug={tenantSlug}
      canEdit={canEdit}
    />
  );
}
