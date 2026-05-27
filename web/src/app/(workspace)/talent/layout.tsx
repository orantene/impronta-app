// Platform-scoped talent shell — /talent/* on app.tulala.digital (no tenant slug).

import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";

import { TULALA_BRAND } from "@/lib/brand/tulala";
import {
  loadTalentSelfProfile,
  loadTalentSelfProfileByUser,
  loadTalentInquiriesAllAgencies,
  loadTalentAgencies,
} from "@/app/(workspace)/[tenantSlug]/_data-bridge/talent";
import { loadTalentCalendarEntries } from "@/components/admin/shell/internal/data-bridge";
import { loadTalentEarnings } from "@/lib/talent/earnings";
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

export const dynamic = "force-dynamic";

const TALENT_SEGMENT_MAP: Record<string, TalentPage> = {
  today: "today",
  inbox: "messages",
  messages: "messages",
  profile: "profile",
  calendar: "calendar",
  money: "money",
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
    membership,
    workspaceUnreadRaw,
    userPrefsRaw,
    tenantIdentity,
    profileDisplayName,
    talentCalendarEntries,
    talentEarnings,
    talentSiteDashboardLoad,
  ] = await Promise.all([
    loadTalentInquiriesAllAgencies(baseProfile.id),
    loadTalentAgencies(talentSelfProfile.id),
    tenantId ? findTenantMembership(tenantId) : Promise.resolve(null),
    tenantId ? loadWorkspaceUnreadCount(tenantId) : Promise.resolve(0),
    loadUserPrefs(session.user.id),
    tenantId ? loadTenantIdentity(tenantId) : Promise.resolve(null),
    loadProfileDisplayName(session.user.id),
    loadTalentCalendarEntries(talentSelfProfile.id),
    loadTalentEarnings(talentSelfProfile.id),
    loadTalentPersonalSiteDashboardState(),
  ]);

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
        tenantIdentity: tenantIdentity ?? PLATFORM_TENANT_IDENTITY,
        sessionIdentity,
        talentSelfProfile,
        talentInquiries,
        talentAgencies,
        isHybrid,
        workspaceUnread: workspaceUnread ?? 0,
        preferredSurface: userPrefs?.preferredSurface ?? null,
        firstRunToggleTipSeen: userPrefs?.firstRunToggleTipSeen ?? false,
        talentCalendarEntries,
        talentEarnings,
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
