import { loadMyReviews } from "./my-reviews.server";
import { loadSavedTalent } from "./saved-talent.server";
import { loadSavedServices } from "./saved-services.server";
import { loadVisitReviewState } from "./visit-review.server";
import { loadMyMatchRequests } from "@/lib/match-me/match-views.server";
import { matchMeEnabled } from "@/lib/match-me/flag";
import { notFound } from "next/navigation";

import { GoogleFontsLink } from "@/app/google-fonts-link";
import { ClientAccountArea, type AreaData } from "@/components/client-account/ClientAccountArea";
import { TalentSiteHtmlTokens } from "@/components/talent/site/TalentSiteHtmlTokens";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadPublicIdentity } from "@/lib/site-admin/server/reads";

import { accountAudience, type AccountView } from "./area-pure";
import { resolveAccountLocale } from "./account-locale.server";
import { hostHasPublicBooking } from "./book-again";
import { accountFlagKindForHost, agencyAccountTabs } from "./agency-area-pure";
import { loadAgencyAccountSite } from "./area-site.server";
import {
  loadAccountProfile, loadOwedPayLinks, loadReceiptDetail, loadReceipts, loadThread, loadThreads,
  loadVisitDetail, loadVisitGroups,
} from "./area-data.server";
import { clientAccountEnabledFor } from "./flag";
import { loadClientAccountSummary } from "./summary.server";
import { resolveAccountTenant } from "./tenant.server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `/account*` on an agency, hub or app host (TUL-64). Same area as a talent
 * site, worn by the host's own tenant. The tenant is the HOST's (proxy-set
 * header, never the URL or the browser); every read is scoped by the session
 * user id AND that tenant, and only for a client account. Flag off: 404.
 */
export async function renderTenantAccountPage(requestedView: AccountView, hostContext: string | null) {
  // TUL-1464: match-me is dark until MATCH_ME_ENABLED is "true"; ?tab=match then falls back to Visits.
  const matchOn = matchMeEnabled();
  const view: AccountView = requestedView.kind === "home" && requestedView.tab === "match" && !matchOn ? { kind: "home", tab: "visits" } : requestedView;
  const flagKind = accountFlagKindForHost(hostContext);
  // TUL-64: agency / hub / app / marketing each use their own CLIENT_ACCOUNT_HOSTS
  // kind (from x-impronta-host-context). Collapsing them onto `app` bounced
  // onboarded clients back to /onboarding/role when only `agency` was listed.
  if (!flagKind || flagKind === "talent" || !clientAccountEnabledFor(flagKind)) notFound();
  if ((view.kind === "visit" || view.kind === "thread") && !UUID.test(view.id)) notFound();
  const [session, tenant] = await Promise.all([getCachedActorSession(), resolveAccountTenant()]);
  if (!tenant) notFound();
  const locale = await resolveAccountLocale(session.user?.id ?? null); // TUL-1191: cookie / saved language, not the path-derived header
  const [identity, site] = await Promise.all([
    loadPublicIdentity(tenant.tenantId).catch(() => null),
    loadAgencyAccountSite(tenant.tenantId),
  ]);
  const brandName = identity?.public_name?.trim() || PLATFORM_BRAND.name; // TUL-776: neutral platform name, never a URL slug
  const userId = session.user?.id ?? null;
  const appRole = session.profile?.app_role ?? null;
  const audience = accountAudience({ userId, appRole });

  const data: AreaData = {};
  if (audience === "client" && userId) {
    const tenantId = tenant.tenantId;
    if (view.kind === "visit") {
      data.visit = await loadVisitDetail(userId, tenantId, view.id, locale);
      data.visitReview = data.visit ? await loadVisitReviewState(userId, tenantId, data.visit.bookingId) : null;
    }
    else if (view.kind === "thread") data.thread = await loadThread(userId, tenantId, view.id);
    else if (view.kind === "receipt") data.receipt = await loadReceiptDetail(userId, tenantId, view.code);
    else if (view.tab === "visits") data.visits = await loadVisitGroups(userId, tenantId);
    else if (view.tab === "messages") data.threads = await loadThreads(userId, tenantId);
    else if (view.tab === "saved") {
      [data.saved, data.savedServices] = await Promise.all([
        loadSavedTalent(userId, hostContext === "hub" ? null : tenantId),
        loadSavedServices(userId, tenantId, locale, { hostKind: hostContext, hostTalentProfileId: null }),
      ]);
    }
    else if (view.tab === "reviews") data.reviews = await loadMyReviews(userId, tenantId);
    else if (view.tab === "match" && matchOn) data.match = await loadMyMatchRequests(userId, tenantId);
    else if (view.tab === "payments") {
      [data.summary, data.payLinks, data.receipts] = await Promise.all([
        loadClientAccountSummary({ userId, tenantId, timeZone: tenant.timeZone, locale }),
        loadOwedPayLinks(userId, tenantId),
        loadReceipts(userId, tenantId),
      ]);
    }
    // TUL-777: every tab needs the profile for the name prompt.
    if (view.kind === "home") data.profile = await loadAccountProfile(userId);
  }
  const hasTokens = Object.keys(site.cssVars).length > 0;
  return (
    <>
      {hasTokens ? <TalentSiteHtmlTokens cssVars={site.cssVars} dataAttrs={site.dataAttrs} /> : null}
      {hasTokens ? <GoogleFontsLink tokens={site.tokens} /> : null}
      <ClientAccountArea
        locale={locale}
        audience={audience}
        view={view}
        talentName={brandName}
        email={session.user?.email ?? null}
        timeZone={tenant.timeZone}
        data={data}
        bookHere={hostHasPublicBooking(hostContext)}
        matchEnabled={matchOn}
        extraTabs={agencyAccountTabs({ hostContext, tenantSlug: tenant.slug, userId, appRole })}
      />
    </>
  );
}
