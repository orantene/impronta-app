// Workspace admin layout — cutover version (Phase 3.12 — full surface bridge).
//
// Mounts the canonical admin shell at every /{tenantSlug}/admin/* route. Pre-fetches
// the chrome's data and THIS page's bridge slices in a single parallel
// Promise.all so the shell opens with real data immediately; the other slices
// arrive in one server action after hydration (see bridge-slices.ts).
//
// initialPage is derived from the request pathname so hard refreshes on
// /admin/messages start on the correct surface without a flash.

import { dashboardMetadata } from "@/i18n/dashboard-metadata";
import { notFound, redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { getTenantScopeBySlug, getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { isPlatformAdmin } from "@/lib/access/platform-role";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { WorkspaceNotAvailableScreen } from "@/components/talent/workspace-not-available-screen";
import {
  loadWorkspaceDomainSummary,
  loadWorkspaceOverviewMetrics,
  loadTalentSelfProfile,
  loadTalentInquiries,
  loadUserNotifications,
  loadRosterCardBadges,
} from "@/components/admin/shell/internal/data-bridge";
import { BRIDGE_SLICE_NAMES, slicesForPage } from "@/components/admin/shell/internal/bridge-slices";
import { loadBridgeSlices } from "./_bridge-slices.server";
import { perfMark, perfStart, timed } from "@/lib/server/perf-trace";
import { loadProfileEditorLayout } from "@/lib/profile-editor/section-layout";
import { loadClientFieldSource } from "@/lib/field-engine/client-field-source";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";
import {
  WORKSPACE_LOCALE_SEED_ATTEMPT_COOKIE,
  isWorkspaceSeedablePath,
  workspaceLocaleSeedHref,
  workspaceLocaleSeedMayApply,
  workspaceLocaleSeedPlan,
} from "@/lib/site-admin/server/workspace-locale-seed";
import { loadWorkspaceSeedPrimary } from "@/lib/site-admin/server/workspace-locale-seed.server";
import { LOCALE_COOKIE } from "@/i18n/locale-middleware";
import { LOCALE_AUTO_COOKIE, LOCALE_OWNER_COOKIE } from "@/i18n/locale-cookies";
import { ORIGINAL_SEARCH_HEADER } from "@/i18n/request-locale";
import { loadPlatformWorkspaceUi } from "@/lib/platform/workspace-ui";
import { loadTalentUnreadCount } from "@/lib/saas/unread-counts";
import { loadShellCounts } from "@/lib/shell/shell-counts";
import { loadUserPrefs, type UserPrefs } from "@/lib/server-actions/user-prefs";
import { loadTalentPageAnalytics } from "@/lib/analytics/talent-analytics";
import { AdminShellClient } from "@/components/admin/shell/admin-shell-client";
import { SupportLauncherShellMount } from "@/components/support/SupportLauncherShellMount";
import type { WorkspacePage } from "@/components/admin/shell/internal/state";
import { clampWorkspacePage, normalizeWorkspaceType } from "@/lib/saas/workspace-type";
import { resolveWorkspaceAdminPage } from "./workspace-page-routing";
import { RealIdentityBanner } from "./_real-identity-banner";
import { loadTenantIdentity, loadProfileDisplayName } from "../_layout-identity";
import { getRequestLocale } from "@/i18n/request-locale";
import { DashboardLocaleProvider } from "@/i18n/use-dashboard-locale";

export const dynamic = "force-dynamic";

export const generateMetadata = dashboardMetadata;

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
  const t0 = perfStart();
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
  const session = await timed("layout.session", () => getCachedActorSession());
  if (!session.supabase) redirect("/login?error=config");
  if (!session.user) redirect(`/login?next=${adminPrefix}`);

  // ── Tenant ─────────────────────────────────────────────────────────────────
  const scope = await timed("layout.scope", () => getTenantScopeBySlug(tenantSlug));
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
  // The four capability reads share one cached membership row, so they are
  // one wave, not four awaits. `manage_billing` is needed before the fan-out
  // because the website slice's health report is gated on it.
  const [canView, canManageBilling, canEditSitePages, canManageDomains] = await Promise.all([
    timed("layout.canView", () => userHasCapability("agency.workspace.view", scope.tenantId)),
    // Same capability the Forms page itself gates on (manage_billing). The nav
    // must agree with the page EXACTLY: gating the link on a role proxy meant
    // the sidebar and the route could disagree, hiding a reachable page (or
    // advertising an unreachable one). Resolved server-side and passed through
    // the bridge so the client never re-derives permissions.
    userHasCapability("manage_billing", scope.tenantId),
    // Website → Redirects link: the route gates on `agency.site_admin.pages.edit`
    // (viewers don't have it), so the sidebar resolves the SAME capability.
    userHasCapability("agency.site_admin.pages.edit", scope.tenantId),
    // `manage_agency_domains` (owner-only) gates the Website domain manager's
    // action affordances — the SAME capability every domain server action
    // requires, so the UI can never offer a button the server refuses.
    userHasCapability("manage_agency_domains", scope.tenantId),
  ]);
  if (!canView) notFound();

  // ── Language seed (TUL-117) ────────────────────────────────────────────────
  // The dashboard renders in the `locale` cookie, and a fresh browser has none
  // (or an auto-written English one). Hop once through the seed route so the
  // owner of a Spanish workspace sees Spanish. Twin of the talent layout; the
  // route re-derives everything and never overwrites a deliberate cookie, and
  // the attempt cookie keeps a failed write from ever looping.
  const jar = await cookies();
  const seedCookies = {
    cookieLocale: jar.get(LOCALE_COOKIE)?.value ?? null,
    cookieIsAuto: Boolean(jar.get(LOCALE_AUTO_COOKIE)?.value),
    cookieOwner: jar.get(LOCALE_OWNER_COOKIE)?.value ?? null,
    userId: session.user.id,
  };
  if (
    !jar.get(WORKSPACE_LOCALE_SEED_ATTEMPT_COOKIE)?.value &&
    hdrs.get("x-impronta-original-pathname") &&
    isWorkspaceSeedablePath(pathname, tenantSlug) &&
    workspaceLocaleSeedMayApply(seedCookies)
  ) {
    const primary = await timed("layout.loadWorkspaceSeedPrimary", () => loadWorkspaceSeedPrimary(scope.tenantId));
    const seedPlan = workspaceLocaleSeedPlan({ ...seedCookies, primary });
    if (seedPlan.locale || seedPlan.stamp) {
      redirect(workspaceLocaleSeedHref(`${pathname}${hdrs.get(ORIGINAL_SEARCH_HEADER) ?? ""}`, tenantSlug));
    }
  }
  perfMark("layout.before-fanout", t0);

  // ── Derive initialPage from URL (avoids hard-refresh flash) ───────────────
  // NB: this is the RAW derivation. It is clamped against the workspace type
  // below, once `loadTenantIdentity` has come back — see the clamp comment.
  const rawInitialPage = deriveInitialPage(pathname, adminPrefix);

  // ── Prefetch in ONE parallel wave: the chrome + this page's slices ────────
  // What the chrome paints on every admin page (identity, session, unread,
  // notifications, locale, plan switches, the KPI counts behind the rail
  // badges) is loaded here on every hard load. The heavy bridge slices
  // (inquiries, clients, calendar, roster, media, website, payouts, ...) are
  // loaded ONLY for the page the URL names; the shell asks for the rest in one
  // server action after hydration (`_bridge-slice-actions.ts`), and a page
  // whose slice is still on its way shows its skeleton. See bridge-slices.ts
  // for the why and the map. Errors in any loader return an empty/null value,
  // never crash the layout.
  const tenantId = scope.tenantId;
  const pageSlices = slicesForPage(rawInitialPage);
  const lazySlices = BRIDGE_SLICE_NAMES.filter((name) => !pageSlices.includes(name));
  const [
    overviewMetrics,
    shellCounts,
    tenantIdentity,
    profileDisplayName,
    talentSelfProfile,
    userNotifications,
    rosterCardBadges,
    profileEditorLayout,
    clientFieldSource,
    localeSettings,
    workspaceUi,
    domainSummary,
    slices,
  ] = await Promise.all([
    // KPI counts: the identity chip's subline and the rail's pending/issues
    // badges read these on first paint. One parallel wave of COUNT queries.
    timed("layout.loadWorkspaceOverviewMetrics", () => loadWorkspaceOverviewMetrics(tenantId)),
    // TUL-387 — chrome badge counts (messages live; money/attention stub 0 until TUL-389).
    timed("layout.loadShellCounts", () => loadShellCounts("workspace", { tenantId })),
    timed("layout.loadTenantIdentity", () => loadTenantIdentity(tenantId)),
    timed("layout.loadProfileDisplayName", () => loadProfileDisplayName(session.user.id)),
    // Phase 0 — hybrid detection. A workspace admin who is ALSO a talent
    // on this tenant's roster gets the mode toggle; non-hybrid admins
    // don't. Returns null when the user has no talent profile here.
    timed("layout.loadTalentSelfProfile", () => loadTalentSelfProfile(session.user.id, tenantId)),
    // B.2 — user notifications feed for the workspace surface.
    timed("layout.loadUserNotifications", () => loadUserNotifications(tenantId, "workspace")),
    // Roster-card badge prefs (agencies.settings.rosterCardBadges).
    timed("layout.loadRosterCardBadges", () => loadRosterCardBadges(tenantId)),
    // B0 — DB-backed profile-editor sidebar layout. Never throws (falls back
    // to the hardcoded structure), so it can't break the layout.
    timed("layout.loadProfileEditorLayout", () => loadProfileEditorLayout()),
    // P1 — DB-resolved client field source (wizard/drawer type-specific
    // catalog). Returns null when every surface is `static` (the default), so
    // it adds no DB work in the default config and never breaks the layout.
    timed("layout.loadClientFieldSource", () => loadClientFieldSource(tenantId)),
    // Tenant locale settings — drives the shell chrome's DashboardLocaleToggle
    // so registry-added languages (e.g. `fr`) appear, not just static en/es.
    // Cached + degrades to the platform fallback, so it never breaks the layout.
    timed("layout.loadTenantLocaleSettings", () => loadTenantLocaleSettings(tenantId)),
    // Platform-wide workspace-UI switches (floating "+" FAB + first-run tour).
    // Degrades to both-hidden on any failure, so it never breaks the layout.
    timed("layout.loadPlatformWorkspaceUi", () => loadPlatformWorkspaceUi()),
    // The domain registry behind `effectiveTenant.domain`; one read, so the
    // storefront address is right on first paint without the website slice.
    timed("layout.loadWorkspaceDomainSummary", () =>
      loadWorkspaceDomainSummary(tenantId).catch(() => null),
    ),
    // This page's slices, or nothing when the page reads none.
    timed("layout.loadBridgeSlices", () =>
      loadBridgeSlices({ tenantId, tenantSlug, canManageBilling }, pageSlices),
    ),
  ]);
  perfMark("layout.after-fanout", t0);

  // Pre-fetch hybrid-only data (talent inquiries + cross-mode unread + user
  // prefs) for users who have a talent profile on this tenant. Combined into
  // a single Promise.all so all three queries run in one network wave —
  // previous version did `await loadTalentInquiries` then a second
  // `await Promise.all([unread, prefs])`, which added a needless round-trip
  // to every navigation. Pure-workspace users skip these entirely.
  const isHybrid = talentSelfProfile != null;
  const [talentInquiries, talentUnread, userPrefs, talentPageAnalytics] = isHybrid
    ? await Promise.all([
        loadTalentInquiries(talentSelfProfile!.id, tenantId),
        loadTalentUnreadCount(talentSelfProfile!.id, tenantId),
        loadUserPrefs(session.user.id),
        // Pro/Portfolio page analytics for the hybrid user's OWN talent
        // profile. Scoped by the SESSION user id — the profile id is a
        // cross-check only — and tier-gated inside the loader (null for Free).
        loadTalentPageAnalytics(session.user.id, talentSelfProfile!.id),
      ])
    : [
        null as Awaited<ReturnType<typeof loadTalentInquiries>> | null,
        undefined as number | undefined,
        null as UserPrefs | null,
        null as Awaited<ReturnType<typeof loadTalentPageAnalytics>>,
      ];
  perfMark("layout.render-start", t0);

  // ── Direct-URL clamp, layer 1 (SPA) ───────────────────────────────────────
  //
  // A business workspace has no roster and no pitches, so `/admin/roster` and
  // `/admin/pitches` must not open those surfaces. `/admin/roster` in
  // particular is SPA-rendered (its page.tsx is a bare PageRouteSyncer) with no
  // canonical matcher behind it, so THIS is what covers that deep link; the
  // roster's server-rendered sub-routes get `assertRosterWorkspace` instead.
  //
  // Computed SERVER-side and passed down, deliberately. The shell's state init
  // is hydration-sensitive — a page derived differently on the client than on
  // the server resets the state machine. `clampWorkspacePage` is pure, so the
  // provider re-running it on the same inputs produces the same answer.
  const initialPage = clampWorkspacePage(
    rawInitialPage,
    normalizeWorkspaceType(tenantIdentity?.workspaceType),
  );

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

  // Seed client dashboard copy with the SERVER-resolved locale so the first
  // paint (rail wordmark tagline, labels) is not English on a Spanish cookie.
  const requestLocale = await getRequestLocale();

  return (
    <DashboardLocaleProvider locale={requestLocale}>
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
          roster: slices.roster ?? null,
          inquiries: slices.inquiries ?? null,
          clients: slices.clients ?? null,
          calendarEvents: slices.calendarEvents ?? null,
          overviewMetrics,
          bookings: slices.bookings ?? null,
          pitches: slices.pitches ?? null,
          teamMembers: slices.teamMembers ?? null,
          // Compat: totalUnread mirrors shellCounts.messages for existing consumers.
          totalUnread: shellCounts.messages,
          shellCounts,
          tenantIdentity,
          sessionIdentity,
          mediaPhotos: slices.mediaPhotos ?? null,
          mediaFolders: slices.mediaFolders ?? [],
          mediaBridgeErrored: slices.mediaBridgeErrored ?? false,
          mediaTotalCount: slices.mediaTotalCount ?? null,
          // The slices this render did NOT load; the shell fetches them after
          // hydration and gates the pages that read them until they arrive.
          lazySlices,
          domainSummary,
          talentSelfProfile,
          talentPageAnalytics,
          talentInquiries,
          isHybrid,
          // Phase 5 — cross-mode unread + user prefs
          talentUnread: talentUnread ?? 0,
          preferredSurface: userPrefs?.preferredSurface ?? null,
          firstRunToggleTipSeen: userPrefs?.firstRunToggleTipSeen ?? false,
          website: slices.website ?? null,
          userNotifications,
          rosterCardBadges,
          payoutsSurface: slices.payoutsSurface ?? null,
          recentActivity: slices.recentActivity ?? null,
          profileEditorLayout,
          clientFieldSource,
          localeSettings: {
            supportedLocales: localeSettings.supportedLocales,
            defaultLocale: localeSettings.defaultLocale,
          },
          workspaceUi,
        }}
        supportSlot={
          <SupportLauncherShellMount
            surface="workspace"
            tenantSlug={tenantSlug}
            tenantId={tenantId}
            canSeeWorkspaceTickets
          />
        }
      >
        {/* PageRouteSyncer lives here — inside AdminShellProvider context, returns null */}
        {children}
      </AdminShellClient>
    </DashboardLocaleProvider>
  );
}
