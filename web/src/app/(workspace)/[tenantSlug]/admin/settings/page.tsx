// Phase 3 — canonical workspace Settings page.
// Server Component — no "use client".

import { notFound } from "next/navigation";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { loadWorkspaceTeamMembers, loadWorkspaceAgencySummary, loadWorkspaceFieldCatalog } from "../../_data-bridge";
import { SettingsClientShell } from "./SettingsClientShell";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

export default async function WorkspaceSettingsPage({
  params,
}: {
  params: PageParams;
}) {
  const { tenantSlug } = await params;

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const canView = await userHasCapability("agency.workspace.view", scope.tenantId);
  if (!canView) notFound();

  const [canManageTeam, teamMembers, summary, fieldGroups] = await Promise.all([
    userHasCapability("manage_memberships", scope.tenantId),
    loadWorkspaceTeamMembers(scope.tenantId),
    loadWorkspaceAgencySummary(scope.tenantId),
    loadWorkspaceFieldCatalog(scope.tenantId),
  ]);

  return (
    <SettingsClientShell
      summary={summary}
      teamMembers={teamMembers}
      canManageTeam={canManageTeam}
      tenantSlug={tenantSlug}
      fieldGroups={fieldGroups}
    />
  );
}
