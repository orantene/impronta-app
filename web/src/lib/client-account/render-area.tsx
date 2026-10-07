import { notFound } from "next/navigation";

import { GoogleFontsLink } from "@/app/google-fonts-link";
import { ClientAccountArea, type AreaData } from "@/components/client-account/ClientAccountArea";
import { TalentSiteHtmlTokens } from "@/components/talent/site/TalentSiteHtmlTokens";
import { getRequestLocale } from "@/i18n/request-locale";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { resolveGatedTalentProfileId } from "@/lib/talent-site/server/talent-site-host-gate";

import { accountAreaGate, accountAudience, type AccountView } from "./area-pure";
import { loadAccountSite, readAccountHost } from "./area-site.server";
import {
  loadAccountProfile, loadOwedPayLinks, loadReceiptDetail, loadReceipts, loadThread, loadThreads,
  loadVisitDetail, loadVisitGroups,
} from "./area-data.server";
import { clientAccountEnabledFor } from "./flag";
import { loadClientAccountSummary } from "./summary.server";
import { resolveAccountTenant } from "./tenant.server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Server entry for every `/account*` view on a talent site. Flag off, or any
 * host that is not a talent site, is a plain 404. The tenant comes from the
 * proxy-set host header only; every read below is scoped by the session user
 * id AND that tenant.
 */
export async function renderClientAccountPage(view: AccountView) {
  const host = await readAccountHost();
  const talentProfileId = resolveGatedTalentProfileId({ hostContext: host.hostContext, talentProfileId: host.talentProfileId });
  if (accountAreaGate({ flagOn: clientAccountEnabledFor("talent"), hostContext: host.hostContext }) !== "render" || !talentProfileId) {
    notFound();
  }
  if ((view.kind === "visit" || view.kind === "thread") && !UUID.test(view.id)) notFound();
  const [locale, session, site, tenant] = await Promise.all([
    getRequestLocale(),
    getCachedActorSession(),
    loadAccountSite(talentProfileId),
    resolveAccountTenant(),
  ]);
  if (!tenant) notFound();
  const userId = session.user?.id ?? null;
  const audience = accountAudience({ userId, appRole: session.profile?.app_role ?? null });

  const data: AreaData = {};
  if (audience === "client" && userId) {
    const tenantId = tenant.tenantId;
    if (view.kind === "visit") data.visit = await loadVisitDetail(userId, tenantId, view.id);
    else if (view.kind === "thread") data.thread = await loadThread(userId, tenantId, view.id);
    else if (view.kind === "receipt") data.receipt = await loadReceiptDetail(userId, tenantId, view.code);
    else if (view.tab === "visits") data.visits = await loadVisitGroups(userId, tenantId);
    else if (view.tab === "messages") data.threads = await loadThreads(userId, tenantId);
    else if (view.tab === "payments") {
      [data.summary, data.payLinks, data.receipts] = await Promise.all([
        loadClientAccountSummary({ userId, tenantId, timeZone: tenant.timeZone, locale }),
        loadOwedPayLinks(userId, tenantId),
        loadReceipts(userId, tenantId),
      ]);
    } else data.profile = await loadAccountProfile(userId);
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
      />
    </>
  );
}

export const ACCOUNT_AREA_METADATA = { robots: { index: false, follow: false } } as const;
