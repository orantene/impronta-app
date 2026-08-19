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
import { isPlatformAdmin } from "@/lib/access/platform-role";
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
  loadWebsiteHealth,
  loadTalentSelfProfile,
  loadTalentInquiries,
  loadUserNotifications,
  loadRosterCardBadges,
  loadRecentActivity,
} from "@/components/admin/shell/internal/data-bridge";
import { loadProfileEditorLayout } from "@/lib/profile-editor/section-layout";
import { loadClientFieldSource } from "@/lib/field-engine/client-field-source";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";
import { loadPlatformWorkspaceUi } from "@/lib/platform/workspace-ui";
import { loadPayoutsSurface } from "./payouts/payouts-surface-actions";
import { loadTalentUnreadCount } from "@/lib/saas/unread-counts";
import { loadUserPrefs, type UserPrefs } from "@/lib/server-actions/user-prefs";
import { AdminShellClient } from "@/components/admin/shell/admin-shell-client";
import type { WorkspacePage } from "@/components/admin/shell/internal/state";
import { resolveWorkspaceAdminPage } from "./workspace-page-routing";
import { RealIdentityBanner } from "./_real-identity-banner";
import { loadTenantIdentity, loadProfileDisplayName } from "../_layout-identity";

export const dynamic = "force-dynamic";

type LayoutParams = Promise<{ tenantSlug: string }>;

/**
 * Derive the workspace page from the raw request pathname.
 *
 * `adminPrefix` must be the BROWSER-facing admin base, which differs by host:
 * `/admin` on the tenant's own domain (improntamodels.com), `/{slug}/admin` on
 * the shared app host. The pathname comes from `x-impronta-original-pathname`,
 * which middleware sets *before* its branded rewrite — so on a custom domain
 * it reads `/admin/messages`, never `/impronta/admin/messages`. Matching it
 * against the slug prefix there silently yielded `""` and opened Overview on
 * every deep link and hard refresh.
 */
function deriveInitialPage(pathname: string, adminPrefix: string): WorkspacePage {
  const after = pathname.startsWith(adminPrefix) ? pathname.slice(adminPrefix.length) : "";
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

  // ── Host shape ─────────────────────────────────────────────────────────────
  // The browser-facing path, set by middleware before its branded rewrite. On
  // a host that already identifies the tenant it carries no slug (`/admin/…`);
  // on the shared app host it does (`/impronta/admin/…`). Everything URL-shaped
  // below keys off this so we never hand the user a doubled
  // `improntamodels.com/impronta/admin`.
  const hdrs = await headers();
  const slugPrefix = `/${tenantSlug}`;
  const pathname = hdrs.get("x-impronta-original-pathname") ?? `${slugPrefix}/admin`;
  const brandedHost = !(pathname === slugPrefix || pathname.startsWith(`${slugPrefix}/`));
  const adminPrefix = brandedHost ? "/admin" : `${slugPrefix}/admin`;

  // ── Auth ───────────────────────────────────────────────────────────────────
  const session = await getCachedActorSession();
  if (!session.supabase) redirect("/login?error=config");
  if (!session.user) redirect(`/login?next=${adminPrefix}`);

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
  const initialPage = deriveInitialPage(pathname, adminPrefix);

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
    userNotifications,
    rosterCardBadges,
    payoutsSurface,
    recentActivity,
    profileEditorLayout,
    clientFieldSource,
    localeSettings,
    workspaceUi,
  ] = await Promise.all([
    loadWorkspaceRosterForCurrentTenant(tenantId),
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
    // B.2 — user notifications feed for the workspace surface.
    loadUserNotifications(tenantId, "workspace"),
    // Roster-card badge prefs (agencies.settings.rosterCardBadges).
    loadRosterCardBadges(tenantId),
    // Payouts surface (Stripe Connect snapshot + base fee). Keyed by slug —
    // the loader resolves scope by slug and gates on the owner capability.
    // Returns `{ ok: false }` on any failure, so it never breaks the layout.
    loadPayoutsSurface(tenantSlug),
    // Recent workspace activity feed (real inquiry_events). Returns [] on
    // any failure — never breaks the layout.
    loadRecentActivity(tenantId),
    // B0 — DB-backed profile-editor sidebar layout. Never throws (falls back
    // to the hardcoded structure), so it can't break the layout.
    loadProfileEditorLayout(),
    // P1 — DB-resolved client field source (wizard/drawer type-specific
    // catalog). Returns null when every surface is `static` (the default), so
    // it adds no DB work in the default config and never breaks the layout.
    loadClientFieldSource(tenantId),
    // Tenant locale settings — drives the shell chrome's DashboardLocaleToggle
    // so registry-added languages (e.g. `fr`) appear, not just static en/es.
    // Cached + degrades to the platform fallback, so it never breaks the layout.
    loadTenantLocaleSettings(tenantId),
    // Platform-wide workspace-UI switches (floating "+" FAB + first-run tour).
    // Degrades to both-hidden on any failure, so it never breaks the layout.
    loadPlatformWorkspaceUi(),
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

  // Same capability the Forms page itself gates on (manage_billing). The nav
  // must agree with the page EXACTLY: gating the link on a role proxy meant
  // the sidebar and the route could disagree, hiding a reachable page (or
  // advertising an unreachable one). Resolved server-side and passed through
  // the bridge so the client never re-derives permissions.
  // Same reasoning for the Website → Redirects link: the route gates on
  // `agency.site_admin.pages.edit` (viewers don't have it), so the sidebar
  // resolves the SAME capability rather than guessing from the role.
  // `manage_agency_domains` (owner-only) gates the Website domain manager's
  // action affordances — the SAME capability every domain server action
  // requires, so the UI can never offer a button the server refuses.
  const [canManageBilling, canEditSitePages, canManageDomains] = await Promise.all([
    userHasCapability("manage_billing", scope.tenantId),
    userHasCapability("agency.site_admin.pages.edit", scope.tenantId),
    userHasCapability("manage_agency_domains", scope.tenantId),
  ]);

  // P2-C — Site Health. Runs after the capability fan-out because the Forms
  // finding is gated on the SAME capability the Forms route gates on; it reuses
  // the website data already loaded above and adds at most one COUNT query.
  const websiteHealth = await loadWebsiteHealth({
    tenantId,
    website: websiteData,
    canManageBilling,
  });

  const sessionIdentity = {
    userId: session.user.id,
    canManageBilling,
    canEditSitePages,
    canManageDomains,
    email: session.user.email ?? "",
    role: scope.membership.role,
    displayName: profileDisplayName,
    // Platform admins get a "Platform" entry point in the workspace
    // switcher — the HQ console isn't a tenant, so it can't surface
    // through agency_memberships like ordinary workspaces.
    isPlatformAdmin: isPlatformAdmin(session.profile),
  };

  return (
    <>
      {/* Real-data diagnostic banner. Dev/preview only — never ships to
          production. It sits above the prototype chrome until the prototype's
          top-bar identity is migrated to consume the bridge.
          See _real-identity-banner.tsx for the replacement plan. */}
      {process.env.NODE_ENV !== "production" && (
        <RealIdentityBanner
          scope={scope}
          user={{ id: session.user.id, email: session.user.email ?? undefined }}
          metrics={overviewMetrics}
        />
      )}
      <AdminShellClient
        tenantSlug={tenantSlug}
        brandedHost={brandedHost}
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
          mediaBridgeErrored: mediaBridge.errored,
          mediaTotalCount: mediaBridge.totalCount,
          talentSelfProfile,
          talentInquiries,
          isHybrid,
          // Phase 5 — cross-mode unread + user prefs
          talentUnread: talentUnread ?? 0,
          preferredSurface: userPrefs?.preferredSurface ?? null,
          firstRunToggleTipSeen: userPrefs?.firstRunToggleTipSeen ?? false,
          website: { ...websiteData, health: websiteHealth },
          userNotifications,
          rosterCardBadges,
          payoutsSurface,
          recentActivity,
          profileEditorLayout,
          clientFieldSource,
          localeSettings: {
            supportedLocales: localeSettings.supportedLocales,
            defaultLocale: localeSettings.defaultLocale,
          },
          workspaceUi,
        }}
      >
        {/* PageRouteSyncer lives here — inside AdminShellProvider context, returns null */}
        {children}
      </AdminShellClient>
    </>
  );
}
