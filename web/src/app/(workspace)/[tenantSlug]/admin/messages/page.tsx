// Phase 3 — workspace Messages page (placeholder).
// Full implementation in Phase 3.4 (real-time messaging).
import { notFound } from "next/navigation";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import {
  ADMIN_PAGE_STACK,
  ADMIN_TEXT_DISPLAY_LG,
  ADMIN_TEXT_EYEBROW,
  ADMIN_HOME_SECTION_GAP,
} from "@/lib/dashboard-shell-classes";
import Link from "next/link";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;

export default async function WorkspaceMessagesPage({ params }: { params: PageParams }) {
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
          <h1 className={ADMIN_TEXT_DISPLAY_LG}>Messages</h1>
        </div>
        <div className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] px-6 py-12 text-center">
          <p className="text-sm font-medium text-[var(--admin-workspace-fg)]">
            Full messaging coming in Phase 3.4
          </p>
          <p className="mt-1 text-xs text-[var(--admin-nav-idle)]">
            View conversations in the{" "}
            <Link href={`/${tenantSlug}/admin/work`} className="text-[var(--admin-accent)] hover:opacity-80 transition-opacity">
              Work pipeline
            </Link>{" "}
            in the meantime.
          </p>
        </div>
      </div>
    </div>
  );
}
