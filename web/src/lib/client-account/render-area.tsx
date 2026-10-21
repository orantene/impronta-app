import { notFound } from "next/navigation";

import { GoogleFontsLink } from "@/app/google-fonts-link";
import { ClientAccountArea, type AreaData } from "@/components/client-account/ClientAccountArea";
import { TalentSiteHtmlTokens } from "@/components/talent/site/TalentSiteHtmlTokens";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { resolveGatedTalentProfileId } from "@/lib/talent-site/server/talent-site-host-gate";

import { accountAreaGate, accountAudience, type AccountView } from "./area-pure";
import { resolveAccountLocale } from "./account-locale.server";
import { loadAccountSite, readAccountHost } from "./area-site.server";
import {
  loadAccountProfile, loadOwedPayLinks, loadReceiptDetail, loadReceipts, loadThread, loadThreads,
  loadVisitDetail, loadVisitGroups,
} from "./area-data.server";
import { loadSavedTalent } from "./saved-talent.server";
import { loadMyReviews } from "./my-reviews.server";
import { loadSavedServices } from "./saved-services.server";
import { loadVisitReviewState } from "./visit-review.server";
import { clientAccountEnabledFor } from "./flag";
import { loadClientAccountSummary } from "./summary.server";
import { renderTenantAccountPage } from "./render-tenant-area";
import { resolveAccountTenant } from "./tenant.server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Server entry for every `/account*` view. A talent site renders here (flag
 * `talent`); every other host goes to `renderTenantAccountPage` (flag `app`).
 * Flag off is a plain 404. The tenant comes from the
 * proxy-set host header only; every read below is scoped by the session user
 * id AND that tenant.
 */
export async function renderClientAccountPage(view: AccountView) {
  const host = await readAccountHost();
  // Agency, hub and app hosts (TUL-64) have their own renderer; flag kind follows
  // x-impronta-host-context (agency / hub / app / marketing).
  if (host.hostContext !== "talent_site") return renderTenantAccountPage(view, host.hostContext);
  const talentProfileId = resolveGatedTalentProfileId({ hostContext: host.hostContext, talentProfileId: host.talentProfileId });
  if (accountAreaGate({ flagOn: clientAccountEnabledFor("talent"), hostContext: host.hostContext }) !== "render" || !talentProfileId) {
    notFound();
  }
  if ((view.kind === "visit" || view.kind === "thread") && !UUID.test(view.id)) notFound();
  const [session, site, tenant] = await Promise.all([
    getCachedActorSession(),
    loadAccountSite(talentProfileId),
    resolveAccountTenant(),
  ]);
  if (!tenant) notFound();
  const userId = session.user?.id ?? null;
  const locale = await resolveAccountLocale(userId); // TUL-1191: cookie / saved language, not the path-derived header
  const audience = accountAudience({ userId, appRole: session.profile?.app_role ?? null });

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
      [data.saved, data.savedServices] = await Promise.all([loadSavedTalent(userId, tenantId), loadSavedServices(userId, tenantId, locale, { hostKind: host.hostContext, hostTalentProfileId: talentProfileId, hubTalentProfileId: tenant.hubTalentProfileId })]);
    }
    else if (view.tab === "reviews") data.reviews = await loadMyReviews(userId, tenantId);
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
        talentName={site.talentName}
        email={session.user?.email ?? null}
        timeZone={tenant.timeZone}
        data={data}
        bookHere
      />
    </>
  );
}

export const ACCOUNT_AREA_METADATA = { robots: { index: false, follow: false } } as const;
