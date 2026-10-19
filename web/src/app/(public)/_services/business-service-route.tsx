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

import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";
import { getRequestLocale } from "@/i18n/request-locale";
import { jsonLdScriptString } from "@/lib/cms/posts-public-model";
import { getPublicTenantScope } from "@/lib/saas/scope";
import { buildTenantLocaleAlternates } from "@/lib/seo/locale-alternates";
import { logServerError } from "@/lib/server/safe-error";
import { loadBusinessServicePage } from "@/lib/services/business-pages/load.server";
import { buildBusinessServiceJsonLd, businessServiceBookHref, businessServiceFacts } from "@/lib/services/business-pages/page-model";
import {
  businessServicePathWithoutLocale,
  businessServiceRoute,
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
  const loaded = await load(slug);
  if (!loaded || loaded.res.status !== "ok") return { robots: { index: false } };
  const { offering } = loaded.res;
  const route = businessServiceRoute({ requested: { segment, slug }, locale: loaded.locale, offering });
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
  const loaded = await load(slug);
  if (!loaded) {
    logServerError("business-service-page", new Error("no public tenant scope or service client"));
    notFound();
  }
  if (loaded.res.status !== "ok") notFound();
  const { offering } = loaded.res;
  const route = businessServiceRoute({ requested: { segment, slug }, locale: loaded.locale, offering });
  if (route.kind === "missing") notFound();
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
      />
      <PublicFooter />
    </>
  );
}
