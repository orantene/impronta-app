// Phase 3 — workspace Production page (placeholder).
// Full implementation in Phase 3.x.
import { notFound } from "next/navigation";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import {
  ADMIN_PAGE_STACK,
  ADMIN_TEXT_DISPLAY_LG,
  ADMIN_TEXT_EYEBROW,
  ADMIN_HOME_SECTION_GAP,
} from "@/lib/dashboard-shell-classes";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;

export default async function WorkspaceProductionPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();
  const canView = await userHasCapability("agency.workspace.view", scope.tenantId);
  if (!canView) notFound();

  return (
    <div className={ADMIN_PAGE_STACK}>
      <div className={ADMIN_HOME_SECTION_GAP}>
        <div>
          <p className={ADMIN_TEXT_EYEBROW}>{scope.membership.display_name}</p>
          <h1 className={ADMIN_TEXT_DISPLAY_LG}>Production</h1>
        </div>
        <div className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] px-6 py-12 text-center">
          <p className="text-sm font-medium text-[var(--admin-workspace-fg)]">
            Production coming soon
          </p>
          <p className="mt-1 text-xs text-[var(--admin-nav-idle)]">
            Casting, crew management, on-set logistics, and rights & safety.
          </p>
        </div>
      </div>
    </div>
  );
}
