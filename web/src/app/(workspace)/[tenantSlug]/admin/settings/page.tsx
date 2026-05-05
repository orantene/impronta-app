// Phase 3 — canonical workspace Settings page.
// Server Component — no "use client".

import { notFound } from "next/navigation";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import {
  loadWorkspaceTeamMembers,
  loadWorkspaceAgencySummary,
  loadWorkspaceDomainSummary,
  loadWorkspaceFieldCatalog,
} from "../../_data-bridge";
import { SettingsClientShell } from "./SettingsClientShell";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;
type PageSearchParams = Promise<{
  dmsg?: string | string[];
  derr?: string | string[];
  section?: string | string[];
}>;

function firstParam(value: string | string[] | undefined): string | null {
  if (typeof value === "string" && value.trim()) return value.trim().slice(0, 200);
  if (Array.isArray(value)) {
    const first = value.find((item) => typeof item === "string" && item.trim());
    if (first) return first.trim().slice(0, 200);
  }
  return null;
}

export default async function WorkspaceSettingsPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: PageSearchParams;
}) {
  const { tenantSlug } = await params;
  const rawSearchParams = await searchParams;

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const canView = await userHasCapability("agency.workspace.view", scope.tenantId);
  if (!canView) notFound();

  const [canManageTeam, canManageDomains, teamMembers, summary, domainSummary, fieldGroups] = await Promise.all([
    userHasCapability("manage_memberships", scope.tenantId),
    userHasCapability("manage_agency_domains", scope.tenantId),
    loadWorkspaceTeamMembers(scope.tenantId),
    loadWorkspaceAgencySummary(scope.tenantId),
    loadWorkspaceDomainSummary(scope.tenantId),
    loadWorkspaceFieldCatalog(scope.tenantId),
  ]);

  const domainMessage = firstParam(rawSearchParams.dmsg);
  const domainError = firstParam(rawSearchParams.derr);
  const openDomainSection =
    firstParam(rawSearchParams.section) === "domain" ||
    Boolean(domainMessage) ||
    Boolean(domainError);

  return (
    <SettingsClientShell
      summary={summary}
      domainSummary={domainSummary}
      teamMembers={teamMembers}
      canManageTeam={canManageTeam}
      canManageDomains={canManageDomains}
      tenantSlug={tenantSlug}
      fieldGroups={fieldGroups}
      openDomainSection={openDomainSection}
      domainMessage={domainMessage}
      domainError={domainError}
    />
  );
}
