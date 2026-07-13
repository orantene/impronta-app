// Platform-scoped talent shell — /talent/* on app.tulala.digital (no tenant slug).

import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";

import { TULALA_BRAND } from "@/lib/brand/tulala";
import {
  loadTalentSelfProfile,
  loadTalentSelfProfileByUser,
  loadTalentInquiriesAllAgencies,
  loadTalentAgencies,
  loadTalentRepresentation,
} from "@/app/(workspace)/[tenantSlug]/_data-bridge/talent";
import { loadTalentCalendarEntries } from "@/components/admin/shell/internal/data-bridge";
import { loadTalentEarningsByCurrency } from "@/lib/talent/earnings-by-currency";
import { loadPlatformOperatingCurrency, applyOperatingCurrencyToEarnings } from "@/lib/platform/operating-currency";
import { getTalentConnectedAccountSnapshot } from "@/lib/payments/stripe-connect-talent";
import { getHeldPayoutTotals } from "@/lib/payments/booking-payouts-ledger";
import { findTenantMembership } from "@/lib/saas/tenant";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { isPlatformAdmin } from "@/lib/access/platform-role";
import { loadWorkspaceUnreadCount } from "@/lib/saas/unread-counts";
import { loadUserPrefs, type UserPrefs } from "@/lib/server-actions/user-prefs";
import { TalentShellClient } from "@/components/admin/shell/admin-shell-client";
import type { TalentPage } from "@/components/admin/shell/internal/state";
import { loadTenantIdentity, loadProfileDisplayName, type TenantIdentityPayload } from "../[tenantSlug]/_layout-identity";
import {
  getActiveTalentAgencyContext,
  listTalentAgencyContexts,
} from "@/lib/talent/active-agency-context";
import { TalentAgencyContextSwitcher } from "@/components/talent/site/TalentAgencyContextSwitcher";
import { TalentSiteDashboardProvider } from "@/components/talent/site/TalentSiteDashboardProvider";
import { loadTalentPersonalSiteDashboardState } from "@/lib/talent-site/server/dashboard-state";
import { loadProfileEditorLayout } from "@/lib/profile-editor/section-layout";
import { loadClientFieldSource } from "@/lib/field-engine/client-field-source";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";

export const dynamic = "force-dynamic";

const TALENT_SEGMENT_MAP: Record<string, TalentPage> = {
  today: "today",
  inbox: "messages",
  messages: "messages",
  profile: "profile",
  reviews: "reviews",
  calendar: "calendar",
  money: "money",
  payouts: "payouts",
  agencies: "money",
  activity: "money",
  reach: "money",
  site: "public-page",
  "public-page": "public-page",
  settings: "settings",
};

function derivePlatformTalentPage(pathname: string): TalentPage {
  const prefix = "/talent";
  const after = pathname.startsWith(prefix)
    ? pathname.slice(prefix.length)
    : "";
  const segment = after.replace(/^\//, "").split("/")[0] ?? "";
  return TALENT_SEGMENT_MAP[segment] ?? "today";
}

const PLATFORM_TENANT_IDENTITY: TenantIdentityPayload = {
  tenantId: "",
  slug: "",
  displayName: TULALA_BRAND.name,
  planTier: "free",
  kind: "app",
  logoUrl: null,
  verifiedDomain: null,
  defaultCoordinatorUserId: null,
  inquiryCoordinatorTalentIds: [],
  networkRequestedAt: null,
};

export default async function PlatformTalentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCachedActorSession();
  if (!session.supabase) redirect("/login?error=config");
  if (!session.user) redirect("/login?next=/talent/today");

  const hdrs = await headers();
  const pathname = hdrs.get("x-impronta-original-pathname") ?? "/talent/today";
  const isTalentRoot =
    pathname === "/talent" || pathname === "/talent/";

  // Full-screen surfaces under /talent/* that own their entire viewport (the
  // freeform Page Builder editor chrome) opt OUT of the dashboard shell so the
  // editor renders bare. The route itself enforces auth + the Max-tier gate;
  // here we only skip the heavy shell + its dashboard data loads.
  if (pathname.startsWith("/talent/page-builder")) {
    return <>{children}</>;
  }

  // The guided onboarding wizard is a focused, full-screen flow that owns its
  // own chrome (like the page-builder editor). It opts OUT of the heavy
  // dashboard shell so the talent sees one step at a time without the nav rail
  // competing for attention. The route itself enforces auth + loads its own
  // data via loadTalentDashboardData (the canonical completeness source).
  if (pathname.startsWith("/talent/onboarding")) {
    return <>{children}</>;
  }

  const baseProfile = await loadTalentSelfProfileByUser(session.user.id);
  if (!baseProfile) {
    if (isTalentRoot) {
      return children;
    }
    notFound();
  }

  const activeAgency = await getActiveTalentAgencyContext(baseProfile.id);
  const agencyOptions = await listTalentAgencyContexts(baseProfile.id);
  const tenantId = activeAgency?.tenantId ?? null;

  const talentSelfProfile =
    tenantId != null
      ? (await loadTalentSelfProfile(session.user.id, tenantId)) ?? baseProfile
      : baseProfile;

  const initialTalentPage = derivePlatformTalentPage(pathname);

  const [
    talentInquiries,
    talentAgencies,
    talentRepresentation,
    membership,
    workspaceUnreadRaw,
    userPrefsRaw,
    tenantIdentity,
    profileDisplayName,
    talentCalendarEntries,
    talentEarnings,
    talentSiteDashboardLoad,
    talentPayoutSnapshot,
    talentHeldPayouts,
    profileEditorLayout,
    clientFieldSource,
    localeSettings,
  ] = await Promise.all([
    loadTalentInquiriesAllAgencies(baseProfile.id),
    loadTalentAgencies(talentSelfProfile.id),
    loadTalentRepresentation(talentSelfProfile.id, talentSelfProfile.profileCode),
    tenantId ? findTenantMembership(tenantId) : Promise.resolve(null),
    tenantId ? loadWorkspaceUnreadCount(tenantId) : Promise.resolve(0),
    loadUserPrefs(session.user.id),
    tenantId ? loadTenantIdentity(tenantId) : Promise.resolve(null),
    loadProfileDisplayName(session.user.id),
    loadTalentCalendarEntries(talentSelfProfile.id),
    loadTalentEarningsByCurrency(talentSelfProfile.id),
    loadTalentPersonalSiteDashboardState(),
    // Stripe Connect payout snapshot for the in-shell Payouts section.
    // Returns { ok:false } on any failure, so it never breaks the layout.
    getTalentConnectedAccountSnapshot(talentSelfProfile.id),
    // Held payout totals (earnings waiting on bank connection) for the banner.
    getHeldPayoutTotals({ talentProfileId: talentSelfProfile.id }),
    // B0 — DB-backed profile-editor sidebar layout. Never throws (falls back
    // to the hardcoded structure), so it can't break the layout.
    loadProfileEditorLayout(),
    // P1 — DB-resolved client field source (wizard/drawer type-specific
    // catalog). Null when every surface is `static` (default). `tenantId` may
    // be null for independent talent — the loader degrades to flags-only.
    loadClientFieldSource(tenantId),
    // Tenant locale settings for the shell chrome's DashboardLocaleToggle.
    // For independent talent (no active agency, tenantId null) the loader
    // returns the single-locale platform fallback, so the toggle hides.
    loadTenantLocaleSettings(tenantId ?? ""),
  ]);

  // Platform currency policy: unless a super-admin has turned multi-currency
  // display ON, collapse the talent's earnings to the single operating currency
  // (default USD) so the dashboard shows one clean figure, not EUR/USD tabs.
  const operatingCurrency = await loadPlatformOperatingCurrency();
  const displayEarnings = applyOperatingCurrencyToEarnings(talentEarnings, operatingCurrency);

  const isHybrid = membership != null;
  const workspaceUnread: number | undefined = isHybrid ? workspaceUnreadRaw : undefined;
  const userPrefs: UserPrefs | null = isHybrid ? userPrefsRaw : null;

  const sessionIdentity = {
    userId: session.user.id,
    email: session.user.email ?? "",
    role: membership?.role ?? "viewer",
    displayName: profileDisplayName,
    isPlatformAdmin: isPlatformAdmin(session.profile),
  };

  return (
    <TalentSiteDashboardProvider initialLoad={talentSiteDashboardLoad}>
    <TalentShellClient
      tenantSlug={activeAgency?.slug}
      platformTalentRoutes
      initialTalentPage={initialTalentPage}
      initialBridgeData={{
        roster: null,
        inquiries: null,
        clients: null,
        calendarEvents: null,
        overviewMetrics: null,
        bookings: null,
        pitches: null,
        teamMembers: null,
        totalUnread: 0,
        // Stamp the talent's exclusivity to the active agency onto the identity
        // payload. Whitelabel branding on the talent dashboard shows the agency
        // logo only when the talent is EXCLUSIVE to it (is_primary) AND the
        // agency is on a whitelabel plan tier; otherwise the surface stays
        // Tulala-canonical.
        tenantIdentity: tenantIdentity
          ? { ...tenantIdentity, talentExclusive: activeAgency?.isPrimary ?? false }
          : PLATFORM_TENANT_IDENTITY,
        sessionIdentity,
        talentSelfProfile,
        talentPayoutSnapshot,
        talentHeldPayouts,
        talentInquiries,
        talentAgencies,
        talentRepresentation,
        isHybrid,
        workspaceUnread: workspaceUnread ?? 0,
        preferredSurface: userPrefs?.preferredSurface ?? null,
        firstRunToggleTipSeen: userPrefs?.firstRunToggleTipSeen ?? false,
        talentCalendarEntries,
        talentEarnings: displayEarnings,
        profileEditorLayout,
        clientFieldSource,
        localeSettings: {
          supportedLocales: localeSettings.supportedLocales,
          defaultLocale: localeSettings.defaultLocale,
        },
      }}
    >
      {isHybrid && agencyOptions.length > 1 ? (
        <div
          style={{
            padding: "8px 16px 0",
            maxWidth: 1200,
            margin: "0 auto",
          }}
        >
          <TalentAgencyContextSwitcher
            agencies={agencyOptions}
            activeTenantId={activeAgency?.tenantId ?? null}
          />
        </div>
      ) : null}
      {children}
    </TalentShellClient>
    </TalentSiteDashboardProvider>
  );
}
