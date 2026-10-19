/**
 * TUL-586: one indexable page per published service on a talent site host.
 * Pure (no DB, no server-only) so the route resolver, the sitemap and the tests share it.
 *
 * URL: a single host-root segment `servicio-<title>-<id8>`. Single segment on purpose: the
 * host router already renders one-segment slugs, so no proxy or allow-list change is needed.
 * The language prefix is the talent's usual grammar (`/en/servicio-...`). Stability comes from
 * `<id8>` (first 8 hex of the offering id): a renamed service keeps resolving, and any other
 * title part is self-canonical to the current slug.
 */
import { offeringMatrixValue } from "@/lib/talent/offering-matrix";
import { publicPriceLine } from "@/lib/talent/public-price-line";
import { buildServiceOffers, type JsonLdOfferingSource } from "@/lib/seo/talent-json-ld";
import { publicPriceForJsonLd, resolvePublicPrice } from "@/lib/talent/public-price";
import { durationLabel } from "@/lib/talent/duration-label";
import type { ServiceContentFields } from "./service-content-fields";

export const SERVICE_SLUG_PREFIX = "servicio-";

const ID8 = /^[0-9a-f]{8}$/;
const SLUG_SHAPE = /^servicio-(?:[a-z0-9-]*-)?([0-9a-f]{8})$/;

export type ServicePageOffering = JsonLdOfferingSource & {
  id: string;
  imageUrls?: string[];
  publicCtaHidden?: boolean;
  /** Fields the catalog already holds; shown when present, never invented (TUL-795). */
  category?: string | null;
  categoryLabel?: string;
  cancellationHours?: number | null;
  bookingMode?: "request" | "instant" | "inquiry" | null;
  reserveMode?: "full" | "deposit" | "free";
  depositPct?: number | null;
  /** `attributes.matrix` carries the talent-typed materials, warranty and response time. */
  attributes?: Record<string, unknown> | null;
};

/** Other published services to link from a service page: same category first, then catalog order. */
export function pickRelatedServices<T extends ServicePageOffering>(offerings: readonly T[], currentId: string, max = 3): T[] {
  const cur = offerings.find((o) => o.id === currentId);
  const others = offerings.filter((o) => o.id !== currentId && isServicePageEligible(o));
  const same = cur?.category ? others.filter((o) => o.category === cur.category) : [];
  return [...same, ...others.filter((o) => !same.includes(o))].slice(0, max);
}

function slugifyTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "");
}

/** A catalog entry that gets its own page: a public service or package. */
export function isServicePageEligible(o: Pick<JsonLdOfferingSource, "kind" | "visibility" | "title">): boolean {
  return (o.kind === "service" || o.kind === "package") && o.visibility !== "agency_only" && o.title.trim() !== "";
}

export function serviceSlug(o: { id: string; title: string }): string {
  const id8 = o.id.replace(/-/g, "").slice(0, 8).toLowerCase();
  const t = slugifyTitle(o.title);
  return `${SERVICE_SLUG_PREFIX}${t ? `${t}-` : ""}${id8}`;
}

/**
 * TUL-792: id -> service page path for the home service cards. `base` is the locale prefix of a
 * published talent site ("" or "/en"); null/undefined (builder, hub, previews) means no links.
 */
export function servicePageHrefs(
  offerings: ReadonlyArray<{ id: string; title: string; kind: JsonLdOfferingSource["kind"]; visibility?: JsonLdOfferingSource["visibility"] }>,
  base: string | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (base == null) return out;
  const prefix = base.replace(/\/+$/, "");
  for (const o of offerings) {
    if (isServicePageEligible(o)) out[o.id] = `${prefix}/${serviceSlug(o)}`;
  }
  return out;
}

/** The id fragment a service slug carries, or null when the slug is not a service slug. */
export function parseServiceSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  const m = SLUG_SHAPE.exec(slug.toLowerCase());
  return m && ID8.test(m[1]) ? m[1] : null;
}

/** Find the eligible offering a slug points at (id8 decides; the title part is cosmetic). */
export function resolveServiceBySlug<T extends ServicePageOffering>(
  offerings: readonly T[],
  slug: string | null | undefined,
): T | null {
  const id8 = parseServiceSlug(slug);
  if (!id8) return null;
  return (
    offerings.find((o) => isServicePageEligible(o) && o.id.replace(/-/g, "").toLowerCase().startsWith(id8)) ?? null
  );
}

/** Only the slug fields the resolver reads (TUL-1272 C1 content columns, held migration). */
type SlugContent = Pick<ServiceContentFields, "slug" | "slugHistory">;

export type ServiceSlugResolution<T> =
  | { kind: "current"; offering: T; slug: string }
  | { kind: "redirect"; offering: T; slug: string; status: 301 }
  | { kind: "missing" };

/** The slug a service answers on: its stored custom slug, else the derived `servicio-<title>-<id8>`. */
export function currentServiceSlug(o: { id: string; title: string }, content?: SlugContent | null): string {
  const custom = content?.slug?.trim().toLowerCase();
  return custom ? custom : serviceSlug(o);
}

function requestedSlug(slug: string | null | undefined): string {
  if (!slug) return "";
  let s = slug.trim();
  try {
    s = decodeURIComponent(s);
  } catch {
    // Malformed escape: compare the raw text, which matches nothing stored.
  }
  return s.replace(/^\/+|\/+$/g, "").toLowerCase();
}

/**
 * TUL-1272 C1: resolve a requested slug with slug history. Order: a current custom slug, then a
 * slug_history entry (301 to the current slug), then the legacy id8 grammar (301 to the custom
 * slug when one is set, else served as today). A current slug always beats another row's history.
 * With no content map (columns not applied yet) this is exactly `resolveServiceBySlug`.
 */
export function resolveServiceSlugWithHistory<T extends ServicePageOffering>(
  offerings: readonly T[],
  slug: string | null | undefined,
  contentById?: ReadonlyMap<string, SlugContent> | null,
): ServiceSlugResolution<T> {
  const req = requestedSlug(slug);
  if (!req) return { kind: "missing" };
  // Sorted by id so a slug two rows both claim (history vs history) always picks the same row.
  const eligible = offerings.filter(isServicePageEligible).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const content = (o: T) => contentById?.get(o.id) ?? null;

  const byCurrent = eligible.find((o) => content(o)?.slug?.trim().toLowerCase() === req);
  if (byCurrent) return { kind: "current", offering: byCurrent, slug: req };

  const byHistory = eligible.find((o) => content(o)?.slugHistory.some((h) => h.trim().toLowerCase() === req));
  if (byHistory) {
    const to = currentServiceSlug(byHistory, content(byHistory));
    return to === req ? { kind: "current", offering: byHistory, slug: to } : { kind: "redirect", offering: byHistory, slug: to, status: 301 };
  }

  const legacy = resolveServiceBySlug(offerings, req);
  if (!legacy) return { kind: "missing" };
  const to = currentServiceSlug(legacy, content(legacy));
  return content(legacy)?.slug?.trim() && to !== req
    ? { kind: "redirect", offering: legacy, slug: to, status: 301 }
    : { kind: "current", offering: legacy, slug: to };
}

/** Host-root paths for the sitemap; `titleOffering` supplies the primary-language title for the slug. */
export function serviceSitemapPaths(offerings: readonly ServicePageOffering[]): string[] {
  return offerings.filter(isServicePageEligible).map((o) => `/${serviceSlug(o)}`);
}

/** The price string every service-page surface paints: the shared public resolver (TUL-791), same text as the home card. Null when empty. `from` kept for callers. */
export function servicePriceLine(o: ServicePageOffering, locale: string, _from?: string): string | null {
  return resolvePublicPrice(o, locale).text || null;
}

export type ServicePageCopy = {
  book: string;
  /** Short label for the phone sticky bar. */
  bookShort: string;
  back: string;
  minutes: (n: number) => string;
  priceFrom: string;
  /** TUL-794: CTA for quote-only services. */
  quote: string;
  related: string;
  freeCancel: (hours: number) => string;
  materials: string;
  warranty: string;
  response: string;
};

export function servicePageCopy(locale: string): ServicePageCopy {
  const en = locale.toLowerCase().startsWith("en");
  return en
    ? { book: "Book this service", bookShort: "Book", back: "All services", minutes: (n) => durationLabel(n), priceFrom: "From", quote: "Request a quote", related: "Other services", freeCancel: (h) => `Free cancellation up to ${h} h before`, materials: "Materials", warranty: "Warranty", response: "Response time" }
    : { book: "Reservar este servicio", bookShort: "Reservar", back: "Todos los servicios", minutes: (n) => durationLabel(n), priceFrom: "Desde", quote: "Pedir cotización", related: "Otros servicios", freeCancel: (h) => `Cancelación gratuita hasta ${h} h antes`, materials: "Materiales", warranty: "Garantía", response: "Tiempo de respuesta" };
}

/** "All services" link: the home page's services section, locale-aware (`/` or `/en` -> `/#services`, `/en/#services`). */
export function serviceBackHref(homePath: string): string {
  const base = homePath && homePath.startsWith("/") && homePath !== "/" ? `${homePath.replace(/\/+$/, "")}/` : "/";
  return `${base}#services`;
}

/** Booking CTA: the existing deep link, which opens the booking sheet on this offering. */
export function serviceBookHref(offeringId: string, homePath: string): string {
  const base = homePath && homePath.startsWith("/") ? homePath : "/";
  return `${base}?book=${encodeURIComponent(offeringId.toLowerCase())}#book`;
}

/** Title and description for the head: the service's own words, else "<service> by <talent> in <city>" (max 160). */
export function serviceMetaText(
  o: Pick<ServicePageOffering, "title" | "description">,
  talentName: string | null,
  opts: { city?: string | null; locale?: string } = {},
): {
  title: string;
  description: string;
} {
  const name = talentName?.trim();
  const title = name ? `${o.title.trim()} | ${name}` : o.title.trim();
  const cap = (t: string) => (t.length > 160 ? `${t.slice(0, 157).trimEnd()}...` : t);
  const d = o.description?.replace(/\s+/g, " ").trim();
  if (d) return { title, description: cap(d) };
  const en = (opts.locale ?? "").toLowerCase().startsWith("en");
  const city = opts.city?.trim();
  const parts = [o.title.trim(), name ? `${en ? "by" : "por"} ${name}` : "", city ? `${en ? "in" : "en"} ${city}` : ""];
  return { title, description: cap(parts.filter(Boolean).join(" ")) };
}

/** Standalone Service JSON-LD for the page (provider = the site's Person). */
export function buildServicePageJsonLd(input: {
  offering: ServicePageOffering;
  canonicalUrl: string;
  personId?: string;
  talentName: string | null;
  inLanguage: string;
}): Record<string, unknown> {
  const { offering: o, canonicalUrl } = input;
  const personId = input.personId ?? `${canonicalUrl}#person`;
  const price = publicPriceForJsonLd(o);
  const offer = buildServiceOffers(
    [{
      name: o.title,
      description: o.description,
      amountCents: price.amountCents,
      currency: o.currency,
      priceDisplay: price.priceDisplay,
      durationMinutes: o.durationMinutes,
    }],
    personId,
    input.inLanguage,
  )[0] as Record<string, unknown> | undefined;
  const item = (offer?.itemOffered ?? {}) as Record<string, unknown>;
  const { itemOffered: _drop, ...offerRest } = offer ?? {};
  void _drop;
  const hasOffer = Object.keys(offerRest).filter((k) => k !== "@type").length > 0;
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": canonicalUrl,
    url: canonicalUrl,
    name: o.title.trim(),
    ...(item.description ? { description: item.description } : {}),
    inLanguage: input.inLanguage,
    provider: input.talentName
      ? { "@type": "Person", "@id": personId, name: input.talentName }
      : { "@id": personId },
    ...(o.imageUrls?.[0] ? { image: o.imageUrls[0] } : {}),
    ...(hasOffer ? { offers: offerRest } : {}),
  };
}

/** TUL-791: the price text every service-page surface paints (same string as the home card). */
export function servicePagePriceText(o: ServicePageOffering, locale: string): string {
  return resolvePublicPrice(o, locale).text;
}

/** TUL-794: true when the service has no stated price and the CTA should ask for a quote. */
export function servicePageIsQuote(o: ServicePageOffering): boolean {
  return resolvePublicPrice(o, "en").mode === "quote";
}

/** Materials, warranty and response time the talent typed for this service, in the page language. Empty rows are dropped, never invented (TUL-795). */
export function serviceTypedFacts(
  o: { attributes?: Record<string, unknown> | null },
  locale: string,
  copy: Pick<ServicePageCopy, "materials" | "warranty" | "response">,
): Array<{ key: "materials" | "warranty" | "response"; label: string; value: string }> {
  const keys = ["materials", "warranty", "response"] as const;
  return keys.flatMap((key) => {
    const value = offeringMatrixValue(o.attributes, key, locale);
    return value ? [{ key, label: copy[key], value }] : [];
  });
}
