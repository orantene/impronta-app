import type { Metadata } from "next";
import { headers } from "next/headers";

import { PublicHeader } from "@/components/public-header";
import { PublicFooter } from "@/components/public-footer";
import {
  getPublicHostContext,
  getPublicPathPrefix,
  getPublicTenantScope,
} from "@/lib/saas/scope";
import { HOST_TALENT_PROFILE_HEADER } from "@/lib/saas/host-context";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createTranslator } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";
import { loadPublicIdentity } from "@/lib/site-admin/server/reads";
import { loadPublicBookableOfferings } from "@/lib/site-admin/server/load-book-page-offerings";
import { buildTenantLocaleAlternates } from "@/lib/seo/locale-alternates";
import { pinnedServiceId } from "@/lib/client-account/book-again";
import { BookPageClient } from "./BookPageClient";
import { RosterRequestList } from "./RosterRequestList";
import { PublicHubEntries } from "@/components/storefront/PublicHubEntries";
import { loadPublicHub } from "@/lib/service-hub/public-hub.server";
import { publicEntryRequestHref } from "@/lib/service-hub/public-hub-request";
import { WORKSPACE_REQUEST_PATH } from "@/lib/service-hub/roster-request";
import { loadWorkspaceRosterServices } from "@/lib/service-hub/roster-services";
import { loadGuestInstantChrome } from "@/lib/scheduling/guest-instant-chrome";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  return {
    title: t("public.bookPage.title"),
    description: t("public.bookPage.lead"),
    ...(await buildTenantLocaleAlternates(locale, "/book")),
  };
}

function slugFromPathPrefix(prefix: string): string {
  const m =
    prefix.match(/^\/w\/([a-z0-9][a-z0-9-]{1,62})$/) ??
    prefix.match(/^\/([a-z0-9][a-z0-9-]{1,62})$/);
  return m?.[1] ?? "";
}

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string | string[] }>;
}) {
  const { service } = await searchParams;
  const locale = await getRequestLocale();
  const t = createTranslator(locale);

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PublicHeader />
        <div className="mx-auto max-w-lg flex-1 px-4 py-20 text-center">
          <h1 className="text-xl font-semibold">{t("public.bookPage.title")}</h1>
          <p className="mt-3 text-m text-[var(--token-color-muted,var(--impronta-muted))]">
            {t("public.slotPicker.unavailable")}
          </p>
        </div>
        <PublicFooter className="mt-auto border-t border-border px-4 py-8 sm:px-6 lg:px-8" />
      </>
    );
  }

  const publicScope = await getPublicTenantScope();
  const host = await getPublicHostContext();
  const tenantId = publicScope?.tenantId ?? (host.kind === "agency" ? host.tenantId : "");
  const talentId = (await headers()).get(HOST_TALENT_PROFILE_HEADER);

  let tenantSlug = host.kind === "agency" ? host.tenantSlug : slugFromPathPrefix(await getPublicPathPrefix());
  if (!tenantSlug && tenantId) {
    const admin = createServiceRoleClient();
    if (admin) {
      const { data } = await admin
        .from("agencies")
        .select("slug")
        .eq("id", tenantId)
        .maybeSingle<{ slug: string | null }>();
      if (data?.slug?.trim()) tenantSlug = data.slug.trim();
    }
  }

  const offerings = await loadPublicBookableOfferings({
    tenantId: tenantId || null,
    talentProfileId: talentId,
    locale,
    host: { kind: host.kind, tenantId: host.kind === "agency" ? host.tenantId : tenantId || null },
  });

  let agencyName = t("public.bookPage.studioFallback");
  if (tenantId) {
    const identity = await loadPublicIdentity(tenantId);
    if (identity?.public_name?.trim()) agencyName = identity.public_name.trim();
  }
  // Respects /w/<slug>; agency hosts serve the contact page at the root.
  const pathPrefix = host.kind === "agency" ? "" : await getPublicPathPrefix();
  const guestChrome = await loadGuestInstantChrome(tenantId || null);
  // TUL-1372: roster services (accepted listings) of an AGENCY workspace, request-only. The tenant is
  // the public host's resolved tenant, never a request parameter. Fails closed (empty).
  const rosterAdmin = host.kind === "agency" && tenantId ? createServiceRoleClient() : null;
  const allRosterItems = rosterAdmin && host.kind === "agency" ? await loadWorkspaceRosterServices(rosterAdmin, tenantId) : [];
  // TUL-1471: the owner's grouped hub entries (request-only) replace the loose rows they contain, so
  // a service never shows twice. Listings still waiting in the review queue stay as loose rows.
  const hub = rosterAdmin && host.kind === "agency" ? await loadPublicHub(rosterAdmin, tenantId) : null;
  const notInHub = hub ? allRosterItems.filter((i) => !hub.coveredListingIds.has(i.listingId)) : allRosterItems;
  // TUL-861: a service already offered in the bookable list above must not be listed a second time as a request row.
  const bookableIds = new Set(offerings.map((o) => o.id));
  const rosterItems = notInHub.filter((i) => !bookableIds.has(i.offeringId));

  return (
    <>
      <PublicHeader />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">{t("public.bookPage.title")}</h1>
        <p className="mt-3 text-sm text-[var(--token-color-muted,rgba(11,11,13,0.62))]">
          {t("public.bookPage.lead")}
        </p>
        <BookPageClient
          tenantSlug={tenantSlug}
          tenantId={tenantId}
          agencyName={agencyName}
          offerings={offerings}
          initialServiceId={pinnedServiceId(offerings, service)}
          signedIn={guestChrome.signedIn}
          client={guestChrome.client}
          captcha={guestChrome.captcha}
          locale={locale}
          contactHref={`${pathPrefix}${WORKSPACE_REQUEST_PATH}`}
        />
        {hub ? <PublicHubEntries entries={hub.entries} locale={locale === "es" ? "es" : "en"} requestHref={(e) => publicEntryRequestHref(`${pathPrefix}${WORKSPACE_REQUEST_PATH}`, e, locale)} bookHref={(e) => (e.bookOfferingId ? `${pathPrefix}/book?service=${encodeURIComponent(e.bookOfferingId)}` : `${pathPrefix}/book`)} /> : null}
        <RosterRequestList
          items={rosterItems}
          contactHref={`${pathPrefix}${WORKSPACE_REQUEST_PATH}`}
          locale={locale}
          copy={{
            heading: t("public.bookPage.rosterHeading"),
            request: t("public.bookPage.rosterRequest"),
            note: t("public.bookPage.rosterNote"),
          }}
        />
      </main>
      <PublicFooter className="mt-auto border-t border-border px-4 py-8 sm:px-6 lg:px-8" />
    </>
  );
}
