// Phase 3 — canonical workspace Work (pipeline) page.
// Server Component — no "use client".

import { notFound } from "next/navigation";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { loadWorkspaceInquiries } from "../../_data-bridge";
import { WorkClientShell } from "./WorkClientShell";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

export default async function WorkspaceWorkPage({
  params,
}: {
  params: PageParams;
}) {
  const { tenantSlug } = await params;

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const canView = await userHasCapability("agency.workspace.view", scope.tenantId);
  if (!canView) notFound();

  const [canCreate, inquiries] = await Promise.all([
    userHasCapability("create_inquiry", scope.tenantId),
    loadWorkspaceInquiries(scope.tenantId),
  ]);

  return (
    <WorkClientShell
      inquiries={inquiries}
      tenantSlug={tenantSlug}
      canCreate={canCreate}
    />
  );
}
