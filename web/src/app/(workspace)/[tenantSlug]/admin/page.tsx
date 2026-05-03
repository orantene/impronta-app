// Phase 3 — canonical workspace overview page.
// Server Component — no "use client".
//
// Renders real workspace metrics for the tenant identified by `tenantSlug`.
// No mock data. Uses `getTenantScopeBySlug` (request-cached — the layout
// already called it, so this is a cache hit) and `loadWorkspaceOverviewMetrics`.

import { notFound } from "next/navigation";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { AdminMetricCard } from "@/components/admin/admin-metric-card";
import {
  ADMIN_HOME_SECTION_GAP,
  ADMIN_PAGE_STACK,
  ADMIN_TEXT_DISPLAY_LG,
  ADMIN_TEXT_EYEBROW,
} from "@/lib/dashboard-shell-classes";
import { loadWorkspaceOverviewMetrics } from "../_data-bridge";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

export default async function WorkspaceAdminOverviewPage({
  params,
}: {
  params: PageParams;
}) {
  const { tenantSlug } = await params;

  // Scope is cached — layout already resolved it; this is a cache hit.
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const metrics = await loadWorkspaceOverviewMetrics(scope.tenantId);

  return (
    <div className={ADMIN_PAGE_STACK}>
      <div className={ADMIN_HOME_SECTION_GAP}>
        {/* Header */}
        <div>
          <p className={ADMIN_TEXT_EYEBROW}>{scope.membership.display_name}</p>
          <h1 className={ADMIN_TEXT_DISPLAY_LG}>Overview</h1>
        </div>

        {/* Metric strip */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <AdminMetricCard
            label="Rostered talent"
            value={metrics?.rosterTotal ?? "—"}
            hint={
              metrics
                ? `${metrics.rosterPublished} published`
                : undefined
            }
          />
          <AdminMetricCard
            label="Open inquiries"
            value={metrics?.openInquiries ?? "—"}
          />
          <AdminMetricCard
            label="Team members"
            value={metrics?.teamMembers ?? "—"}
          />
          <AdminMetricCard
            label="Pending approvals"
            value={metrics?.pendingApprovals ?? "—"}
            href={
              metrics && metrics.pendingApprovals > 0
                ? `/${tenantSlug}/admin/roster?filter=pending`
                : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}
