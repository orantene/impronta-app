// Phase 3 — canonical workspace roster page.
// Server Component — no "use client".
//
// Loads enriched roster (with primaryTypeLabel) and hands off to
// RosterClientShell which handles all filtering / sorting / view state.
// Capability gate: agency.roster.view.

import { notFound } from "next/navigation";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { loadWorkspaceRosterEnriched } from "../../_data-bridge";
import { RosterClientShell } from "./RosterClientShell";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

export default async function WorkspaceRosterPage({
  params,
}: {
  params: PageParams;
}) {
  const { tenantSlug } = await params;

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const [canView, canEdit, roster] = await Promise.all([
    userHasCapability("agency.roster.view", scope.tenantId),
    userHasCapability("agency.roster.edit", scope.tenantId),
    loadWorkspaceRosterEnriched(scope.tenantId),
  ]);

  if (!canView) notFound();

  return (
    <RosterClientShell
      roster={roster}
      tenantSlug={tenantSlug}
      canEdit={canEdit}
    />
  );
}
