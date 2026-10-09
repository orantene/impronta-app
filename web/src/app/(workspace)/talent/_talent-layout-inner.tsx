// Heavy half of the platform talent shell (the data loads + <TalentShellClient>).
// layout.tsx wraps this in <Suspense fallback={<TalentShellSkeleton />}> so the
// first paint is the skeleton, not a blank page, while these loads finish.
// Agenda V2 rollout: see docs/plans/today-calendar/ROLLOUT.md (TALENT_AGENDA_V2).
// Legacy Today/Calendar remain behind isAgendaV2 until Step 4 delete PR.

import { notFound, redirect } from "next/navigation";
import { cookies, headers } from "next/headers";

import { TULALA_BRAND } from "@/lib/brand/tulala";
import {
  loadTalentSelfProfile,
  loadTalentSelfProfileByUser,
  loadTalentInquiriesAllAgencies,
  loadTalentAgencies,
  loadTalentRepresentation,
} from "@/app/(workspace)/[tenantSlug]/_data-bridge/talent";
import { loadTalentVisibleInquiryIds } from "@/lib/messaging/talent-inbox-rows";
import { scopeTalentNotificationsToInbox } from "@/lib/notifications/talent-inbox-scope";
import { loadTalentSurfaceNotifications } from "@/app/(workspace)/[tenantSlug]/_data-bridge/notifications";
import { loadTalentCalendarEntries } from "@/components/admin/shell/internal/data-bridge";
import { loadTalentAgenda } from "@/lib/talent-agenda/load";
import { isAgendaV2 } from "@/lib/talent-agenda/flag";
import { loadTalentDashboardData } from "@/lib/talent-dashboard-data";
import { loadTalentEarningsByCurrency } from "@/lib/talent/earnings-by-currency";
import { loadPlatformOperatingCurrency, applyOperatingCurrencyToEarnings } from "@/lib/platform/operating-currency";
import { getTalentConnectedAccountSnapshot } from "@/lib/payments/stripe-connect-talent";
import { loadTalentPayoutAttention } from "@/lib/payments/talent-payout-attention";
import { findTenantMembership } from "@/lib/saas/tenant";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { isPlatformAdmin } from "@/lib/access/platform-role";
import { loadWorkspaceUnreadCount } from "@/lib/saas/unread-counts";
import { loadShellCounts, type ShellCounts } from "@/lib/shell/shell-counts";
import { loadUserPrefs, type UserPrefs } from "@/lib/server-actions/user-prefs";
import { TalentShellClient } from "@/components/admin/shell/admin-shell-client";
import { SupportLauncherShellMount } from "@/components/support/SupportLauncherShellMount";
import type { TalentPage } from "@/components/admin/shell/internal/state";
import { loadTenantIdentity, loadProfileDisplayName, type TenantIdentityPayload } from "../[tenantSlug]/_layout-identity";
import { getActiveTalentAgencyContext } from "@/lib/talent/active-agency-context";
import { TalentSiteDashboardProvider } from "@/components/talent/site/TalentSiteDashboardProvider";
import { loadTalentPersonalSiteDashboardState } from "@/lib/talent-site/server/dashboard-state";
import { loadProfileEditorLayout } from "@/lib/profile-editor/section-layout";
import { loadClientFieldSource } from "@/lib/field-engine/client-field-source";
import { loadTalentLocaleState } from "@/lib/site-admin/server/talent-locale-settings";
import {
  TALENT_LOCALE_SEED_ATTEMPT_COOKIE,
  talentLocaleSeedHopPossible,
  talentLocaleSeedHref,
  talentLocaleSeedPlan,
} from "@/lib/site-admin/server/talent-locale-seed";
import { LOCALE_COOKIE } from "@/i18n/locale-middleware";
import { LOCALE_AUTO_COOKIE, LOCALE_OWNER_COOKIE } from "@/i18n/locale-cookies";
import { getRequestLocale, ORIGINAL_SEARCH_HEADER } from "@/i18n/request-locale";
import { DashboardLocaleProvider } from "@/i18n/use-dashboard-locale";
import { loadTalentPageAnalytics } from "@/lib/analytics/talent-analytics";
import { loadPlatformWorkspaceUi } from "@/lib/platform/workspace-ui";
import { loadTalentPlanGrants } from "@/lib/plan-trials/talent-grants";
import { talentStudioV2Enabled } from "@/lib/talent/studio-flag";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { loadOwnedBusinessWorkspace } from "@/lib/talent-site/server/workspace-site-context";
import { resolveDashboardIdentity } from "@/lib/impersonation/dashboard-identity";
import { effectiveReadContext } from "@/lib/impersonation/effective-read";
import { resolveTalentActingAs, talentActingAsBannerCopy } from "@/lib/impersonation/acting-as";
import { ImpersonationBanner } from "@/components/dashboard/impersonation-banner";

const TALENT_SEGMENT_MAP: Record<string, TalentPage> = {
  today: "today",
  attention: "attention",
  inbox: "messages",
  messages: "messages",
  services: "services",
  profile: "profile",
  reviews: "reviews",
  calendar: "calendar",
  bookings: "booking-record",
  money: "money",
  clients: "clients",
  payouts: "payouts",
  agencies: "money",
  activity: "money",
  reach: "money",
  site: "public-page",
  presence: "public-page",
  "public-page": "public-page",
  settings: "settings",
};

/** Snapshot the agenda window outside the layout body so purity lint stays quiet. */
async function loadTalentAgendaForLayout(talentProfileId: string) {
  const nowMs = Date.now();
  try {
    const result = await loadTalentAgenda(talentProfileId, {
      from: new Date(nowMs - 90 * 86_400_000),
      to: new Date(nowMs + 270 * 86_400_000),
    });
    return { ...result, error: null as string | null };
  } catch (err) {
    logServerError("talent-layout.loadTalentAgenda", err);
    return {
      items: [] as import("@/lib/talent-agenda/types").TalentAgendaItem[],
      hours: null,
      error: "Could not load your agenda. Refresh and try again.",
    };
  }
}

function derivePlatformTalentPage(pathname: string): TalentPage {
  const prefix = "/talent";
  const after = pathname.startsWith(prefix)
    ? pathname.slice(prefix.length)
    : "";
  const parts = after.replace(/^\//, "").split("/").filter(Boolean);
  const segment = parts[0] ?? "";
  if (segment === "calendar" && parts[1] === "availability") return "calendar-availability";
  if (segment === "bookings" && parts[1] === "new") return "bookings-new";
  if (segment === "bookings" && parts[1]) return "booking-record";
  return TALENT_SEGMENT_MAP[segment] ?? "today";
}

const PLATFORM_TENANT_IDENTITY: TenantIdentityPayload = {
  tenantId: "",
  slug: "",
  displayName: TULALA_BRAND.name,
  planTier: "free",
  kind: "app",
  // The platform talent surface is not a tenant workspace at all; "talent"
  // is the every-surface-visible default and changes nothing here.
  workspaceType: "talent",
  // The platform talent surface has no venue and no service rules, so this is
  // false as a fact, not as a default.
  takesReservations: false,
  // No tenant, no events. False as a fact.
  runsEvents: false,
  // No `agencies` row, so no industry preset. Null as a fact; the nav shapes
  // it reads are a workspace-rail concern and this surface has no rail.
  industryPreset: null,
  logoUrl: null,
  accentColor: null,
  verifiedDomain: null,
  defaultCoordinatorUserId: null,
  inquiryCoordinatorTalentIds: [],
  networkRequestedAt: null,
  // No tenant, so no `agencies.settings` blob and no point of sale to reach
  // from here. Empty as a FACT (this surface has no location to sell from),
  // not as a stand-in for "we did not look" — which is why the shell's
  // `readWorkspacePosBridge` defaults an ABSENT list to ["counter"] and leaves
  // an explicit empty one alone.
  posModes: [],
};

export async function TalentLayoutInner({
  children,
}: {
  children: React.ReactNode;
}) {
  // Cached per request: the outer layout already gated on this session, so
  // these re-reads cost nothing and the redirects below are only a type guard.
  const session = await getCachedActorSession();
  if (!session.supabase) redirect("/login?error=config");
  if (!session.user) redirect("/login?next=/talent/today");

  const hdrs = await headers();
  const pathname = hdrs.get("x-impronta-original-pathname") ?? "/talent/today";
  const isTalentRoot =
    pathname === "/talent" || pathname === "/talent/";

  // Real impersonation only (validated cookie). resolveDashboardIdentity may try
  // to clear a stale cookie, which an RSC cannot do, so a throw means "not acting".
  // TUL-245: every shell read below keys on the EFFECTIVE user. The context
  // comes only from the verified impersonation helper.
  const impersonationIdentity = await resolveDashboardIdentity().catch(() => null);
  const readCtx = effectiveReadContext(session.user.id, impersonationIdentity);
  const subjectUserId = readCtx.userId;

  const baseProfile = await loadTalentSelfProfileByUser(subjectUserId);
  if (!baseProfile) {
    // Root owns the wall / onboarding decision. Sub-routes used to call
    // notFound() here whenever the user-scoped profile read missed — that
    // turned a successful /talent → /talent/today redirect into a branded
    // 404 for demo-jor-clone (and any talent whose first layout read flaked).
    // Hand the page the children without shell so the route can still run;
    // a later navigation reloads the shell once the profile is readable.
    if (isTalentRoot || pathname.startsWith("/talent/")) {
      return <>{children}</>;
    }
    notFound();
  }

  // TUL-129: /talent itself never paints the shell. Its page redirects a talent straight to
  // /talent/today (which runs the full shell loads once), so running ~20 dashboard reads here
  // only to throw the result away on that redirect doubled the sign-in cost.
  if (isTalentRoot) {
    return <>{children}</>;
  }

  const activeAgency = await getActiveTalentAgencyContext(baseProfile.id);
  const tenantId = activeAgency?.tenantId ?? null;

  const talentSelfProfile =
    tenantId != null
      ? (await loadTalentSelfProfile(subjectUserId, tenantId)) ?? baseProfile
      : baseProfile;

  // TUL-129: decide the locale-seed hop BEFORE the heavy dashboard loads. The
  // hop re-enters this layout, so deciding after them ran every read twice on
  // each sign-in (sign-in clears the locale cookies, so the hop is the norm).
  // The locale state is one cheap read that the batch below reuses.
  const jar = await cookies();
  const talentLocaleStatePromise = loadTalentLocaleState(talentSelfProfile.id);
  if (
    talentLocaleSeedHopPossible({
      attemptCookie: jar.get(TALENT_LOCALE_SEED_ATTEMPT_COOKIE)?.value,
      originalPathnameHeader: hdrs.get("x-impronta-original-pathname"),
      pathname,
    })
  ) {
    const early = await talentLocaleStatePromise;
    const seedPlan = talentLocaleSeedPlan({
      cookieLocale: jar.get(LOCALE_COOKIE)?.value ?? null,
      cookieIsAuto: Boolean(jar.get(LOCALE_AUTO_COOKIE)?.value),
      cookieOwner: jar.get(LOCALE_OWNER_COOKIE)?.value ?? null,
      userId: session.user.id,
      primary: early.seedPrimary,
    });
    if (seedPlan.locale || seedPlan.stamp) {
      redirect(talentLocaleSeedHref(`${pathname}${hdrs.get(ORIGINAL_SEARCH_HEADER) ?? ""}`));
    }
  }

  const initialTalentPage = derivePlatformTalentPage(pathname);
  // Evaluate once on the server and stamp onto the bridge — client
  // components cannot read TALENT_AGENDA_V2 (non-NEXT_PUBLIC).
  const talentAgendaV2 = isAgendaV2(talentSelfProfile.id);

  const zeroShellCounts: ShellCounts = { messages: 0, money: 0, attention: 0 };

  const [
    talentInquiries,
    talentAgencies,
    talentRepresentation,
    membership,
    workspaceUnreadRaw,
    shellCounts,
    userPrefsRaw,
    tenantIdentity,
    profileDisplayName,
    talentCalendarEntries,
    talentAgendaLoad,
    talentEarnings,
    talentSiteDashboardLoad,
    talentPayoutSnapshot,
    talentPayoutAttention,
    profileEditorLayout,
    clientFieldSource,
    talentLocaleState,
    userNotificationsAll,
    talentPageAnalytics,
    workspaceUi,
    talentDashboardLoad,
    visibleInquiryIds,
    talentPlanGrants,
    operatingCurrency,
    requestLocale,
  ] = await Promise.all([
    loadTalentInquiriesAllAgencies(baseProfile.id),
    loadTalentAgencies(talentSelfProfile.id),
    loadTalentRepresentation(talentSelfProfile.id, talentSelfProfile.profileCode),
    tenantId ? findTenantMembership(tenantId) : Promise.resolve(null),
    tenantId ? loadWorkspaceUnreadCount(tenantId) : Promise.resolve(0),
    // TUL-387 — talent chrome badge counts (replaces the prior hard-coded zero).
    tenantId
      ? loadShellCounts("talent", {
          tenantId,
          talentProfileId: talentSelfProfile.id,
        })
      : Promise.resolve(zeroShellCounts),
    loadUserPrefs(session.user.id),
    tenantId ? loadTenantIdentity(tenantId) : Promise.resolve(null),
    loadProfileDisplayName(subjectUserId),
    // Agenda V2: loadTalentAgenda behind the flag only. Flag off keeps the
    // legacy calendar bridge so Today/Calendar stay unchanged.
    talentAgendaV2
      ? Promise.resolve([])
      : loadTalentCalendarEntries(talentSelfProfile.id),
    talentAgendaV2
      ? loadTalentAgendaForLayout(talentSelfProfile.id)
      : Promise.resolve({ items: [], hours: null, error: null as string | null }),
    loadTalentEarningsByCurrency(talentSelfProfile.id),
    loadTalentPersonalSiteDashboardState(undefined, readCtx),
    // Stripe Connect payout snapshot for the in-shell Payouts section.
    // Returns { ok:false } on any failure, so it never breaks the layout.
    getTalentConnectedAccountSnapshot(talentSelfProfile.id),
    // Payout legs that did NOT land (reversed / failed / still held), with
    // booking context, for the Payouts page. Supersedes the held-only totals:
    // a reversed leg reached no talent surface at all before this.
    loadTalentPayoutAttention(talentSelfProfile.id),
    // B0 — DB-backed profile-editor sidebar layout. Never throws (falls back
    // to the hardcoded structure), so it can't break the layout.
    loadProfileEditorLayout(),
    // P1 — DB-resolved client field source (wizard/drawer type-specific
    // catalog). Null when every surface is `static` (default). `tenantId` may
    // be null for independent talent — the loader degrades to flags-only.
    loadClientFieldSource(tenantId),
    // The talent's OWN languages (primary + secondary, bounded to platform
    // public locales) drive the shell's DashboardLocaleToggle / LanguageMenu.
    // No secondary = single locale, so the toggle hides. Never throws.
    talentLocaleStatePromise,
    // Talent-surface notifications (`user_notifications`, surface='talent').
    // Cross-agency on purpose — see the loader's comment. Without this the
    // shell's `bridgeUserNotifications` stayed null on the whole talent
    // surface and the notifications drawer had nothing but mock rows to
    // render. Returns [] on any failure, so it never breaks the layout.
    loadTalentSurfaceNotifications(readCtx),
    // Pro/Portfolio page analytics — profile views + inquiry conversion for the
    // signed-in talent's OWN profile. Scoped by the SESSION user id (the
    // profile id is only a cross-check, never the scope), tier-gated inside the
    // loader, and returns null for a Free talent so the surface shows the
    // upsell instead of zeros. Bridged here rather than fetched on mount: an
    // in-shell fetch on this surface has stuck on "Loading" before.
    loadTalentPageAnalytics(subjectUserId, talentSelfProfile.id),
    loadPlatformWorkspaceUi(),
    // Real completeness for the Today card (same source as the guided wizard).
    // Never fatal: a load failure leaves the card on its old estimate.
    loadTalentDashboardData().catch(() => null),
    // TUL-220: these four used to be awaited one after another AFTER the batch
    // above, stacking four round trips onto every talent page before the shell
    // could stream. None depends on the batch, so they ride in it.
    // The bell counts only conversations she can open in Messages (TUL-52 B).
    loadTalentVisibleInquiryIds(readCtx).catch(() => null),
    loadTalentPlanGrants(talentSelfProfile.id).catch(() => null),
    loadPlatformOperatingCurrency(),
    getRequestLocale(),
  ]);

  const userNotifications = scopeTalentNotificationsToInbox(userNotificationsAll, visibleInquiryIds);

  // Platform currency policy: unless a super-admin has turned multi-currency
  // display ON, collapse the talent's earnings to the single operating currency
  // (default USD) so the dashboard shows one clean figure, not EUR/USD tabs.
  const displayEarnings = applyOperatingCurrencyToEarnings(talentEarnings, operatingCurrency);

  // Locale seeding is decided above, before the heavy loads (TUL-129).
  const localeSettings = talentLocaleState.settings;

  // Seed client dashboard copy with the SERVER-resolved locale so the first
  // render is not English regardless of the cookie (use-dashboard-locale.ts).

  const actingAs = resolveTalentActingAs(impersonationIdentity);

  // Dual owner on the hub: isHybrid is per-tenant, so also look up a business workspace this
  // person owns (any tenant) for the rail's Talent | Admin switch. A failed read means no switch.
  let ownedWorkspaceSlug: string | null = null;
  try {
    const adminDb = createServiceRoleClient();
    if (adminDb) {
      const owned = await loadOwnedBusinessWorkspace(adminDb, subjectUserId);
      if (owned.ownsBusinessWorkspace) ownedWorkspaceSlug = owned.workspaceSlug;
    }
  } catch (err) {
    logServerError("talentLayout.ownedWorkspace", err);
  }

  const isHybrid = membership != null;
  const workspaceUnread: number | undefined = isHybrid ? workspaceUnreadRaw : undefined;
  const userPrefs: UserPrefs | null = isHybrid ? userPrefsRaw : null;

  const sessionIdentity = {
    userId: session.user.id,
    email: session.user.email ?? "",
    role: membership?.role ?? "viewer",
    displayName: profileDisplayName,
    isPlatformAdmin: isPlatformAdmin(session.profile),
    // TUL-164: set only for a validated impersonation cookie, never for an owner.
    actingAs,
  };

  const actingAsCopy = actingAs ? talentActingAsBannerCopy(requestLocale, actingAs.name) : null;

  return (
    <DashboardLocaleProvider locale={requestLocale}>
    {actingAs && actingAsCopy ? (
      <ImpersonationBanner
        effectiveName={actingAsCopy.effectiveName}
        effectiveAvatarUrl={impersonationIdentity?.effectiveProfile?.avatar_url ?? null}
        roleLabel={actingAsCopy.roleLabel}
        readOnlyLine={actingAsCopy.readOnlyLine}
        v1ReadOnlyQaLine={actingAsCopy.v1ReadOnlyQaLine}
        returnCta={actingAsCopy.returnCta}
        ariaLabel={actingAsCopy.ariaLabel}
      />
    ) : null}
    <TalentSiteDashboardProvider initialLoad={talentSiteDashboardLoad}>
    <TalentShellClient
      tenantSlug={activeAgency?.slug}
      platformTalentRoutes
      talentStudioV2={talentStudioV2Enabled()}
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
        // Compat: totalUnread mirrors shellCounts.messages for existing consumers.
        totalUnread: shellCounts.messages,
        // Identity bar / mobile nav read talentUnread on the talent surface.
        talentUnread: shellCounts.messages,
        shellCounts,
        // Stamp the talent's exclusivity to the active agency onto the identity
        // payload. Whitelabel branding on the talent dashboard shows the agency
        // logo only when the talent is EXCLUSIVE to it (is_primary) AND the
        // agency is on a whitelabel plan tier; otherwise the surface stays
        // Tulala-canonical.
        tenantIdentity: tenantIdentity
          ? {
              ...tenantIdentity,
              talentExclusive: activeAgency?.isPrimary ?? false,
              // Whitelabel accent on the talent dashboard requires EXCLUSIVE
              // representation, mirroring the whitelabel logo/brand rule. A
              // talent on multiple rosters keeps Tulala's chrome.
              accentColor: activeAgency?.isPrimary ? tenantIdentity.accentColor : null,
            }
          : PLATFORM_TENANT_IDENTITY,
        sessionIdentity,
        talentSelfProfile,
        talentPlanTrial:
          talentPlanGrants?.active?.grantKind === "trial"
            ? { active: true, expiresAt: talentPlanGrants.active.expiresAt }
            : null,
        talentCompletion:
          talentDashboardLoad && talentDashboardLoad.ok
            ? {
                percent: talentDashboardLoad.data.completionScore,
                missing: talentDashboardLoad.data.missingItems.map((m) => ({
                  key: m.key,
                  label: m.label,
                })),
              }
            : null,
        talentPageAnalytics,
        talentPayoutSnapshot,
        talentPayoutAttention,
        talentInquiries,
        talentAgencies,
        talentRepresentation,
        isHybrid,
        ownedWorkspaceSlug,
        workspaceUnread: workspaceUnread ?? 0,
        preferredSurface: userPrefs?.preferredSurface ?? null,
        firstRunToggleTipSeen: userPrefs?.firstRunToggleTipSeen ?? false,
        // Read from the RAW prefs, not the hybrid-gated `userPrefs`: the
        // Day-1 checklist is a talent-only surface, so gating it on hybrid
        // would make the dismissal never stick for pure talents.
        talentChecklistDismissed: userPrefsRaw?.talentChecklistDismissed ?? false,
        talentCalendarEntries,
        talentAgendaItems: talentAgendaLoad.items,
        talentAgendaHours: talentAgendaLoad.hours,
        talentAgendaError: talentAgendaLoad.error,
        talentAgendaV2,
        talentEarnings: displayEarnings,
        userNotifications,
        profileEditorLayout,
        clientFieldSource,
        localeSettings: {
          supportedLocales: localeSettings.supportedLocales,
          defaultLocale: localeSettings.defaultLocale,
        },
        talentLocales: {
          primary: localeSettings.defaultLocale,
          secondary: localeSettings.secondaryLocales,
        },
        // Bridge only the support switch: passing fabEnabled through would
        // silently un-gate the workspace FAB on the talent surface (the shell
        // renders it without a surface check).
        workspaceUi: workspaceUi ? { ...workspaceUi, fabEnabled: false } : workspaceUi,
      }}
      supportSlot={
        <SupportLauncherShellMount
          surface="talent"
          tenantSlug={activeAgency?.slug ?? null}
          tenantId={activeAgency?.tenantId ?? null}
        />
      }
    >
      {/* Agency-context switching lives in the identity bar's "Acting as"
          chip → Switch-agency drawer (in-place cookie switch + refresh). The
          old raw <select> strip that rendered here duplicated that control
          and sat as an unstyled band above the shell chrome. */}
      {children}
    </TalentShellClient>
    </TalentSiteDashboardProvider>
    </DashboardLocaleProvider>
  );
}
