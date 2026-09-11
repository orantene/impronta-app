/**
 * /admin — the Overview (Main board, WS005).
 *
 * A server page that reads today's numbers through the readers the rest of
 * the workspace trusts (`loadOverviewSnapshot`) and hands them to the shell's
 * OverviewBoard through the snapshot store. The page itself renders nothing
 * visible: the shell hosts the board in its own <main>, exactly as it hosts
 * every other SPA page, so the route stays non-canonical and the sidebar's
 * Overview row keeps its soft navigation.
 *
 * Read-only. Nothing here writes.
 */
import { headers } from "next/headers";

import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { userHasCapability } from "@/lib/access";
import { OverviewSnapshotSyncer } from "@/components/admin/shell/internal/page-modules/overview-snapshot-store";
import { loadOverviewSnapshot } from "../_data-bridge/overview-board";
import { PageRouteSyncer } from "./_page-route-syncer";

export const dynamic = "force-dynamic";

export default async function AdminPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const session = await getCachedActorSession();
  const scope = session.user ? await getTenantScopeBySlug(tenantSlug) : null;
  const canView = scope ? await userHasCapability("agency.workspace.view", scope.tenantId) : false;

  // The browser-facing admin base, by host shape: `/admin` on the tenant's own
  // domain, `/{slug}/admin` on the shared host (same derivation as the layout).
  const hdrs = await headers();
  const pathname = hdrs.get("x-impronta-original-pathname") ?? `/${tenantSlug}/admin`;
  const branded = !(pathname === `/${tenantSlug}` || pathname.startsWith(`/${tenantSlug}/`));
  const adminBase = branded ? "/admin" : `/${tenantSlug}/admin`;

  const snapshot =
    scope && canView
      ? await loadOverviewSnapshot({ tenantId: scope.tenantId, tenantSlug, adminBase })
      : null;

  return (
    <>
      <OverviewSnapshotSyncer snapshot={snapshot} />
      <PageRouteSyncer page="overview" />
    </>
  );
}
