/**
 * What a business service page shows and states to search engines (TUL-1272 #5).
 * Pure, so the route, the sitemap and tests share it.
 *
 * Plan rule (PM-confirmed 2026-10-19): free = no own page; studio / agency /
 * network = own page. Everything sits behind SERVICE_PRESENTATION_RESOLVER_ENABLED.
 * D-10a: an on_request service is shown with NO price, on the page and in JSON-LD.
 */
import { buildBreadcrumbJsonLd } from "@/lib/seo/breadcrumb-json-ld";
import { presentationEntitlementsForPlan } from "@/lib/services/presentation/trade-defaults";
import {
  buildServicePageJsonLd,
  servicePageCopy,
  servicePageIsQuote,
  servicePagePriceText,
  type ServicePageOffering,
} from "@/lib/talent-site/service-page";
import { buildServiceFaqJsonLd, type ServiceFaqItem } from "@/lib/talent-site/service-page-faq";

export type BusinessServiceOffering = ServicePageOffering;

export function businessServicePagesAllowed(input: { flagOn: boolean; planTier: string | null | undefined }): boolean {
  if (!input.flagOn) return false;
  return presentationEntitlementsForPlan(input.planTier ?? null).allowedModes.includes("own_page");
}

export type BusinessServicePageCopy = {
  back: string;
  photos: string;
  policies: string;
  onRequest: string;
  freeCancel: (hours: number) => string;
  deposit: (pct: number) => string;
  payFull: string;
  payNone: string;
};

export function businessServicePageCopy(locale: string): BusinessServicePageCopy {
  return locale.toLowerCase().startsWith("en")
    ? {
        back: "Home",
        photos: "Photos",
        policies: "Policies",
        onRequest: "Price on request",
        freeCancel: (h) => `Free cancellation up to ${h} h before`,
        deposit: (p) => `${p}% deposit when you book`,
        payFull: "Paid in full when you book",
        payNone: "No payment needed to book",
      }
    : {
        back: "Inicio",
        photos: "Fotos",
        policies: "Políticas",
        onRequest: "Precio a consultar",
        freeCancel: (h) => `Cancelación gratuita hasta ${h} h antes`,
        deposit: (p) => `Anticipo del ${p}% al reservar`,
        payFull: "Se paga el total al reservar",
        payNone: "No se paga nada al reservar",
      };
}

export type BusinessServiceFacts = {
  priceText: string | null;
  priceNote: string | null;
  durationText: string | null;
  categoryLabel: string | null;
  policies: string[];
  photos: string[];
  ctaLabel: string;
};

export const BUSINESS_SERVICE_PHOTO_MAX = 6;

export function businessServiceFacts(o: BusinessServiceOffering, locale: string): BusinessServiceFacts {
  const copy = servicePageCopy(locale);
  const c = businessServicePageCopy(locale);
  const onRequest = o.visibility === "on_request";
  const quote = servicePageIsQuote(o);
  const policies: string[] = [];
  if (o.cancellationHours && o.cancellationHours > 0) policies.push(c.freeCancel(o.cancellationHours));
  if (o.reserveMode === "deposit" && o.depositPct && o.depositPct > 0) policies.push(c.deposit(o.depositPct));
  else if (o.reserveMode === "full") policies.push(c.payFull);
  else if (o.reserveMode === "free") policies.push(c.payNone);
  return {
    priceText: onRequest || quote ? null : servicePagePriceText(o, locale) || null,
    priceNote: onRequest ? c.onRequest : null,
    durationText: o.durationMinutes && o.durationMinutes > 0 ? copy.minutes(o.durationMinutes) : null,
    categoryLabel: o.categoryLabel ?? o.category ?? null,
    policies,
    photos: [...new Set((o.imageUrls ?? []).filter((u) => typeof u === "string" && u.trim() !== ""))].slice(0, BUSINESS_SERVICE_PHOTO_MAX),
    ctaLabel: onRequest || quote ? copy.quote : copy.book,
  };
}

/** Service (provider = the business Organization) + BreadcrumbList (+ FAQPage when shown), as one @graph. */
export function buildBusinessServiceJsonLd(input: {
  offering: BusinessServiceOffering;
  canonicalUrl: string;
  businessName: string | null;
  locale: string;
  faq: readonly ServiceFaqItem[];
}): Record<string, unknown> {
  const url = new URL(input.canonicalUrl);
  const parts = url.pathname.split("/").filter(Boolean).slice(0, -2);
  const home = `${url.origin}${parts.length ? `/${parts.join("/")}` : "/"}`;
  const orgId = `${url.origin}/#organization`;
  const { "@context": ctx, ...service } = buildServicePageJsonLd({
    offering: input.offering,
    canonicalUrl: input.canonicalUrl,
    personId: orgId,
    talentName: null,
    inLanguage: input.locale,
  });
  const name = input.businessName?.trim();
  service.provider = { "@type": "Organization", "@id": orgId, ...(name ? { name } : {}), url: `${url.origin}/` };
  const crumbs = buildBreadcrumbJsonLd([
    { name: input.locale.toLowerCase().startsWith("en") ? "Home" : "Inicio", url: home },
    { name: input.offering.title.trim(), url: input.canonicalUrl },
  ]);
  const graph: Record<string, unknown>[] = [service];
  if (crumbs) {
    const { "@context": _c, ...node } = crumbs;
    void _c;
    graph.push({ ...node, "@id": `${input.canonicalUrl}#breadcrumb` });
  }
  const faq = buildServiceFaqJsonLd(input.faq, input.canonicalUrl);
  if (faq) graph.push(faq);
  return { "@context": ctx, "@graph": graph };
}

/**
 * Where "Reservar" goes on a business service page: the workspace's own `/book` page with this
 * service preselected (`?service=<id>`). Verified 2026-10-19: business (agency) homes do NOT read
 * the talent-site deep link `?book=<id>#book` (only `_talent-site/TalentSiteContactBridge` does),
 * so that link would be dead here. `/book` honours `?service=` once #4078 lands; until then the
 * param is ignored and the guest still lands on the working booking page.
 */
export function businessServiceBookHref(bookPath: string, offeringId: string): string {
  return `${bookPath}?service=${encodeURIComponent(offeringId)}`;
}
