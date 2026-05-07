// Workspace admin layout — cutover version (Phase 3.12 — full surface bridge).
//
// Mounts the prototype shell at every /{tenantSlug}/admin/* route. Pre-fetches
// all surface data in a single parallel Promise.all so the shell opens with
// real data immediately — no loading spinners on first paint.
//
// initialPage is derived from the request pathname so hard refreshes on
// /admin/messages start on the correct surface without a flash.

import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { getCachedActorSession } from "@/lib/server/request-cache";
import {
  loadWorkspaceRosterForCurrentTenant,
  loadInquiriesForMessages,
  loadWorkspaceClients,
  loadCalendarEvents,
  loadWorkspaceOverviewMetrics,
  loadWorkspaceBookings,
  loadWorkspaceTeamMembers,
  loadTotalUnreadMessages,
} from "@/app/prototypes/admin-shell/_data-bridge";
import { AdminShellPrototypePageClient } from "@/app/prototypes/admin-shell/_shell-client";
import type { WorkspacePage } from "@/app/prototypes/admin-shell/_state";
import { resolveWorkspaceAdminPage } from "./workspace-page-routing";
import { RealIdentityBanner } from "./_real-identity-banner";

export const dynamic = "force-dynamic";

type LayoutParams = Promise<{ tenantSlug: string }>;

/** Derive the workspace page from the raw request pathname. */
function deriveInitialPage(pathname: string, tenantSlug: string): WorkspacePage {
  // Strip leading /{tenantSlug}/admin/ (or /{tenantSlug}/admin) to get segment
  const prefix = `/${tenantSlug}/admin`;
  const after = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : "";
  // after is "" | "/messages" | "/messages/…" | "/roster" | etc.
  const segment = after.replace(/^\//, "").split("/")[0] ?? "";
  return resolveWorkspaceAdminPage(segment || "overview");
}

export default async function WorkspaceAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: LayoutParams;
}) {
  const { tenantSlug } = await params;

  // ── Auth ───────────────────────────────────────────────────────────────────
  const session = await getCachedActorSession();
  if (!session.supabase) redirect("/login?error=config");
  if (!session.user) redirect(`/login?next=/${tenantSlug}/admin`);

  // ── Tenant ─────────────────────────────────────────────────────────────────
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  // ── Capability ─────────────────────────────────────────────────────────────
  const canView = await userHasCapability("agency.workspace.view", scope.tenantId);
  if (!canView) notFound();

  // ── Derive initialPage from URL (avoids hard-refresh flash) ───────────────
  const hdrs = await headers();
  const pathname = hdrs.get("x-impronta-original-pathname") ?? `/${tenantSlug}/admin`;
  const initialPage = deriveInitialPage(pathname, tenantSlug);

  // ── Prefetch all surface data in parallel ──────────────────────────────────
  // Errors in any loader return an empty/null value — never crash the layout.
  const tenantId = scope.tenantId;
  const [
    roster,
    inquiries,
    clients,
    calendarEvents,
    overviewMetrics,
    bookings,
    teamMembers,
    totalUnread,
  ] = await Promise.all([
    loadWorkspaceRosterForCurrentTenant(),
    loadInquiriesForMessages(tenantId),
    loadWorkspaceClients(tenantId),
    loadCalendarEvents(tenantId),
    loadWorkspaceOverviewMetrics(tenantId),
    loadWorkspaceBookings(tenantId),
    loadWorkspaceTeamMembers(tenantId),
    loadTotalUnreadMessages(tenantId),
  ]);

  return (
    <>
      {/* Real-data banner sits above the prototype chrome until the
          prototype's top-bar identity is migrated to consume the bridge.
          See _real-identity-banner.tsx for the replacement plan. */}
      <RealIdentityBanner
        scope={scope}
        user={{ id: session.user.id, email: session.user.email ?? undefined }}
        metrics={overviewMetrics}
      />
      <AdminShellPrototypePageClient
        tenantSlug={tenantSlug}
        initialPage={initialPage}
        initialBridgeData={{
          roster,
          inquiries,
          clients,
          calendarEvents,
          overviewMetrics,
          bookings,
          teamMembers,
          totalUnread,
        }}
      >
        {/* PageRouteSyncer lives here — inside ProtoProvider context, returns null */}
        {children}
      </AdminShellPrototypePageClient>
    </>
  );
}
