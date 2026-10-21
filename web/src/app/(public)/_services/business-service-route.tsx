/**
 * `/services/<slug>` and `/servicios/<slug>` on a business site (TUL-1272 #5).
 * Both route folders call this with their own segment.
 *
 * Gate order: flag SERVICE_PRESENTATION_RESOLVER_ENABLED, then the plan
 * (studio / agency / network have own pages), then the row (the workspace's own,
 * published + approved, public or on_request, service or package). Anything else
 * is notFound(). A stale title or the other language's word gets a 301 to the
 * canonical path. Missing -> 404, never a soft page.
 */
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";

import CmsPublicPage, { generateMetadata as cmsPageMetadata } from "@/app/(public)/p/[[...slug]]/page";
import { loadDatedPicker } from "@/app/(public)/_dated/dated-picker-actions";
import { DatedPlacesMount } from "@/components/public-booking/DatedPlacesMount";
import { shouldMountDatedStep } from "@/lib/sessions/dated-mount";
import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";
import { getRequestLocale } from "@/i18n/request-locale";
import { resolveOldServiceSlug } from "@/lib/offerings/offering-index";
import { loadOfferingIndex } from "@/lib/offerings/offering-index.server";
import { servicePresentationResolverEnabled } from "@/lib/services/presentation/flag";
import { jsonLdScriptString } from "@/lib/cms/posts-public-model";
import { getPublicTenantScope } from "@/lib/saas/scope";
import { buildTenantLocaleAlternates } from "@/lib/seo/locale-alternates";
import { logServerError } from "@/lib/server/safe-error";
import { loadBusinessServicePage } from "@/lib/services/business-pages/load.server";
import { buildBusinessServiceJsonLd, businessServiceBookHref, businessServiceFacts } from "@/lib/services/business-pages/page-model";
import {
  businessServicePathWithoutLocale,
  businessServiceRoute,
  parseBusinessServiceSlug,
  type BusinessServiceSegment,
} from "@/lib/services/business-pages/paths";
import { loadOfferingImageUrls } from "@/lib/storefront/catalog-images";
import { loadPublicIdentity } from "@/lib/site-admin/server/reads";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { serviceMetaText } from "@/lib/talent-site/service-page";
import { serviceFaqItems } from "@/lib/talent-site/service-page-faq";

import { BusinessServiceView } from "./business-service-view";

export type BusinessServiceParams = { params: Promise<{ slug: string }> };

/** One read per request: metadata and the page share it (React cache, keyed on the slug). */
const load = cache(async (slug: string) => {
  const scope = await getPublicTenantScope();
  const admin = createServiceRoleClient();
  if (!scope || !admin) return null;
  const locale = await getRequestLocale();
  const res = await loadBusinessServicePage({
    db: admin,
    tenantId: scope.tenantId,
    slug,
    locale,
    loadImages: (ids) => loadOfferingImageUrls(admin, ids),
  });
  return { res, locale, tenantId: scope.tenantId };
});

/**
 * TUL-1594: a slug no row answers to (loader "missing", or an id8 that matches nothing) may be an
 * OLD slug kept in `offering_slugs`. Flag off, table missing, any read error, or no match = null,
 * i.e. exactly today's 404. A match is re-run through the page's own loader by id8 and sent to the
 * path this route already renders, so the redirect can never land on a 404.
 */
async function oldSlugRedirectPath(segment: BusinessServiceSegment, slug: string, tenantId: string, locale: string): Promise<string | null> {
  if (!servicePresentationResolverEnabled()) return null;
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const index = await loadOfferingIndex(admin, { owner: { kind: "workspace", tenantId }, primaryLocale: locale });
  if (!index) return null;
  const offeringId = resolveOldServiceSlug({ slug, locale, publicLocales: [locale], hostKind: "business", index });
  if (!offeringId) return null;
  const id8 = offeringId.replace(/-/g, "").slice(0, 8).toLowerCase();
  const res = await loadBusinessServicePage({
    db: admin,
    tenantId,
    slug: id8,
    locale,
    loadImages: async () => new Map<string, string[]>(),
  });
  if (res.status !== "ok") return null;
  const route = businessServiceRoute({ requested: { segment, slug: id8 }, locale, offering: { id: res.offering.id, title: res.slugTitle } });
  return route.kind === "redirect" ? route.pathWithoutLocale : null;
}

function alternatesFor(locale: string, slug: string) {
  return buildTenantLocaleAlternates(locale, businessServicePathWithoutLocale(locale, slug), {
    pathnameForLocale: (code) => businessServicePathWithoutLocale(code, slug),
  });
}

async function localePath(locale: string, pathWithoutLocale: string): Promise<string> {
  const alt = await buildTenantLocaleAlternates(locale, pathWithoutLocale);
  const canonical = alt.alternates?.canonical;
  if (!canonical) return pathWithoutLocale;
  try {
    return new URL(String(canonical)).pathname;
  } catch {
    return String(canonical);
  }
}

export async function businessServiceMetadata(segment: BusinessServiceSegment, { params }: BusinessServiceParams): Promise<Metadata> {
  const { slug } = await params;
  // TUL-1594: no id8 = not a service page URL; it is the CMS page this path always was (the gate lets it through).
  if (parseBusinessServiceSlug(slug) === null) return cmsPageMetadata({ params: Promise.resolve({ slug: [segment, slug] }) });
  const loaded = await load(slug);
  if (!loaded || loaded.res.status !== "ok") return { robots: { index: false } };
  const { offering } = loaded.res;
  const route = businessServiceRoute({ requested: { segment, slug }, locale: loaded.locale, offering: { id: offering.id, title: loaded.res.slugTitle } });
  const canonicalSlug = route.kind === "render" ? route.slug : slug;
  const identity = await loadPublicIdentity(loaded.tenantId).catch(() => null);
  const meta = serviceMetaText(offering, identity?.public_name?.trim() || null, { locale: loaded.locale });
  const image = offering.imageUrls[0];
  return {
    title: meta.title,
    description: meta.description,
    openGraph: { title: meta.title, description: meta.description, ...(image ? { images: [{ url: image }] } : {}) },
    ...(await alternatesFor(loaded.locale, canonicalSlug)),
  };
}

export async function BusinessServicePage({ segment, params }: { segment: BusinessServiceSegment } & BusinessServiceParams) {
  const { slug } = await params;
  // TUL-1594: a plain slug (no id8) is an old service slug (301) or the CMS page this path always was.
  if (parseBusinessServiceSlug(slug) === null) {
    const scope = await getPublicTenantScope();
    if (scope) {
      const to = await oldSlugRedirectPath(segment, slug, scope.tenantId, await getRequestLocale());
      if (to) permanentRedirect(await localePath(await getRequestLocale(), to));
    }
    return <CmsPublicPage params={Promise.resolve({ slug: [segment, slug] })} />;
  }
  const loaded = await load(slug);
  if (!loaded) {
    logServerError("business-service-page", new Error("no public tenant scope or service client"));
    notFound();
  }
  if (loaded.res.status !== "ok") {
    if (loaded.res.status === "missing") {
      const to = await oldSlugRedirectPath(segment, slug, loaded.tenantId, loaded.locale);
      if (to) permanentRedirect(await localePath(loaded.locale, to));
    }
    notFound();
  }
  const { offering } = loaded.res;
  const route = businessServiceRoute({ requested: { segment, slug }, locale: loaded.locale, offering: { id: offering.id, title: loaded.res.slugTitle } });
  if (route.kind === "missing") {
    const to = await oldSlugRedirectPath(segment, slug, loaded.tenantId, loaded.locale);
    if (to) permanentRedirect(await localePath(loaded.locale, to));
    notFound();
  }
  if (route.kind === "redirect") permanentRedirect(await localePath(loaded.locale, route.pathWithoutLocale));

  const [identity, alternates, homeHref, bookPath] = await Promise.all([
    loadPublicIdentity(loaded.tenantId).catch(() => null),
    alternatesFor(loaded.locale, route.slug),
    localePath(loaded.locale, "/"),
    localePath(loaded.locale, "/book"),
  ]);
  // Business homes do not read the talent deep link (?book=...#book): go to the workspace's
  // /book page with this service preselected (`?service=`, read by /book per #4078).
  const bookHref = businessServiceBookHref(bookPath, offering.id);
  const facts = businessServiceFacts(offering, loaded.locale);
  const faq = serviceFaqItems(offering, [], loaded.locale);
  const canonical = alternates.alternates?.canonical ? String(alternates.alternates.canonical) : null;
  const jsonLd = canonical
    ? buildBusinessServiceJsonLd({ offering, canonicalUrl: canonical, businessName: identity?.public_name ?? null, locale: loaded.locale, faq })
    : null;
  // TUL-1411: an item that sells dated places books through the dated step, here in the
  // protected booking panel. Items with no upcoming date keep the generic booking link.
  const picker = offering.publicCtaHidden ? null : await loadDatedPicker({ tenantId: loaded.tenantId, offeringId: offering.id });
  const bookingSlot =
    picker && picker.ok && shouldMountDatedStep(picker) ? (
      <DatedPlacesMount
        tenantId={loaded.tenantId}
        offeringId={offering.id}
        locale={loaded.locale}
        picker={picker}
        returnPath={await localePath(loaded.locale, businessServicePathWithoutLocale(loaded.locale, route.slug))}
      />
    ) : null;
  return (
    <>
      {jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScriptString(jsonLd) }} /> : null}
      <PublicHeader />
      <BusinessServiceView
        locale={loaded.locale}
        title={offering.title}
        description={offering.description?.trim() ?? ""}
        facts={facts}
        faq={faq}
        homeHref={homeHref}
        bookHref={offering.publicCtaHidden ? null : bookHref}
        bookingSlot={bookingSlot}
      />
      <PublicFooter />
    </>
  );
}
