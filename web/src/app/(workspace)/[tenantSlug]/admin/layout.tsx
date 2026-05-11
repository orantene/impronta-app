// Workspace admin layout — cutover version (Phase 3.12 — full surface bridge).
//
// Mounts the canonical admin shell at every /{tenantSlug}/admin/* route. Pre-fetches
// all surface data in a single parallel Promise.all so the shell opens with
// real data immediately — no loading spinners on first paint.
//
// initialPage is derived from the request pathname so hard refreshes on
// /admin/messages start on the correct surface without a flash.

import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTenantScopeBySlug, getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { WorkspaceNotAvailableScreen } from "@/components/talent/workspace-not-available-screen";
import {
  loadWorkspaceRosterForCurrentTenant,
  loadInquiriesForMessages,
  loadWorkspaceClients,
  loadCalendarEvents,
  loadWorkspaceOverviewMetrics,
  loadWorkspaceBookings,
  loadWorkspacePitches,
  loadWorkspaceTeamMembers,
  loadTotalUnreadMessages,
  loadWorkspaceMediaBridge,
  loadWebsiteData,
  loadTalentSelfProfile,
  loadTalentInquiries,
} from "@/components/admin/shell/internal/data-bridge";
import { loadTalentUnreadCount } from "@/lib/saas/unread-counts";
import { loadUserPrefs, type UserPrefs } from "@/lib/server-actions/user-prefs";
import { AdminShellClient } from "@/components/admin/shell/admin-shell-client";
import type { WorkspacePage } from "@/components/admin/shell/internal/state";
import { resolveWorkspaceAdminPage } from "./workspace-page-routing";
import { RealIdentityBanner } from "./_real-identity-banner";
import { loadTenantIdentity, loadProfileDisplayName } from "../_layout-identity";

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
  if (!scope) {
    // Phase 3 — Pure Talent state: if the user has no workspace membership
    // but IS rostered as a talent in this tenant, show the "Workspace not
    // available" screen instead of a 404. Truly unrelated users still 404.
    const portalScope = await getTenantPortalScopeBySlug(tenantSlug);
    if (portalScope) {
      // We have a valid tenant. Check if this user is a talent on its roster.
      const talentProfile = await loadTalentSelfProfile(session.user.id, portalScope.tenantId);
      if (talentProfile) {
        return (
          <WorkspaceNotAvailableScreen
            tenantSlug={tenantSlug}
            talentDisplayName={talentProfile.displayName}
          />
        );
      }
    }
    notFound();
  }

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
    pitches,
    teamMembers,
    totalUnread,
    tenantIdentity,
    profileDisplayName,
    mediaBridge,
    talentSelfProfile,
    websiteData,
  ] = await Promise.all([
    loadWorkspaceRosterForCurrentTenant(),
    loadInquiriesForMessages(tenantId),
    loadWorkspaceClients(tenantId),
    loadCalendarEvents(tenantId),
    loadWorkspaceOverviewMetrics(tenantId),
    loadWorkspaceBookings(tenantId),
    loadWorkspacePitches(tenantId),
    loadWorkspaceTeamMembers(tenantId),
    loadTotalUnreadMessages(tenantId),
    loadTenantIdentity(tenantId),
    loadProfileDisplayName(session.user.id),
    loadWorkspaceMediaBridge(tenantId),
    // Phase 0 — hybrid detection. A workspace admin who is ALSO a talent
    // on this tenant's roster gets the mode toggle; non-hybrid admins
    // don't. Returns null when the user has no talent profile here.
    loadTalentSelfProfile(session.user.id, tenantId),
    loadWebsiteData(tenantId),
  ]);

  // Pre-fetch hybrid-only data (talent inquiries + cross-mode unread + user
  // prefs) for users who have a talent profile on this tenant. Combined into
  // a single Promise.all so all three queries run in one network wave —
  // previous version did `await loadTalentInquiries` then a second
  // `await Promise.all([unread, prefs])`, which added a needless round-trip
  // to every navigation. Pure-workspace users skip these entirely.
  const isHybrid = talentSelfProfile != null;
  const [talentInquiries, talentUnread, userPrefs] = isHybrid
    ? await Promise.all([
        loadTalentInquiries(talentSelfProfile!.id, tenantId),
        loadTalentUnreadCount(talentSelfProfile!.id, tenantId),
        loadUserPrefs(session.user.id),
      ])
    : [
        null as Awaited<ReturnType<typeof loadTalentInquiries>> | null,
        undefined as number | undefined,
        null as UserPrefs | null,
      ];

  const sessionIdentity = {
    userId: session.user.id,
    email: session.user.email ?? "",
    role: scope.membership.role,
    displayName: profileDisplayName,
  };

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
      <AdminShellClient
        tenantSlug={tenantSlug}
        initialPage={initialPage}
        initialBridgeData={{
          roster,
          inquiries,
          clients,
          calendarEvents,
          overviewMetrics,
          bookings,
          pitches,
          teamMembers,
          totalUnread,
          tenantIdentity,
          sessionIdentity,
          mediaPhotos: mediaBridge.photos,
          mediaFolders: mediaBridge.folders,
          talentSelfProfile,
          talentInquiries,
          isHybrid,
          // Phase 5 — cross-mode unread + user prefs
          talentUnread: talentUnread ?? 0,
          preferredSurface: userPrefs?.preferredSurface ?? null,
          firstRunToggleTipSeen: userPrefs?.firstRunToggleTipSeen ?? false,
          website: websiteData,
        }}
      >
        {/* PageRouteSyncer lives here — inside AdminShellProvider context, returns null */}
        {children}
      </AdminShellClient>
    </>
  );
}
