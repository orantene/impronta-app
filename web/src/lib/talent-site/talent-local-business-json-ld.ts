/**
 * TUL-74: schema.org `LocalBusiness` for a talent site, built ONLY from what
 * the talent entered (name, city, links, services). Nothing is invented: no
 * address when there is no city, no priceRange when no service states a price.
 * Pure, so the tests share it with the server glue.
 *
 * Services are `Offer -> Service` nodes inside an `OfferCatalog`, each with the
 * stated MXN/USD price (exact = price, from = minPrice, quote = no price).
 */

import { buildServiceOffers, type TalentJsonLdService } from "@/lib/seo/talent-json-ld";

type Json = string | number | boolean | null | { [k: string]: Json | undefined } | Json[];
type JsonObject = Record<string, Json>;

export interface TalentLocalBusinessInput {
  /** Absolute URL of the page this is emitted on (the page canonical). */
  canonicalUrl: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  /** City the talent works from. Without it no LocalBusiness is emitted. */
  addressLocality?: string | null;
  /** Public profile links the talent published (Instagram etc.). */
  sameAs?: readonly string[] | null;
  inLanguage?: string | null;
  services?: readonly TalentJsonLdService[] | null;
}

/** "MXN 450-1,200" from the stated prices, only when they share one currency. */
export function priceRangeOf(services: readonly TalentJsonLdService[] | null | undefined): string | null {
  const priced = (services ?? []).filter(
    (s) =>
      (s.priceDisplay === "exact" || s.priceDisplay === "from") &&
      typeof s.amountCents === "number" &&
      s.amountCents > 0 &&
      !!s.currency?.trim(),
  );
  if (priced.length === 0) return null;
  const currencies = new Set(priced.map((s) => s.currency!.trim().toUpperCase()));
  if (currencies.size !== 1) return null;
  const amounts = priced.map((s) => Math.round((s.amountCents as number) / 100));
  const lo = Math.min(...amounts);
  const hi = Math.max(...amounts);
  const fmt = (n: number) => n.toLocaleString("en-US");
  return `${[...currencies][0]} ${lo === hi ? fmt(lo) : `${fmt(lo)}-${fmt(hi)}`}`;
}

export function buildTalentLocalBusinessJsonLd(input: TalentLocalBusinessInput): JsonObject | null {
  const name = input.name?.trim();
  const city = input.addressLocality?.trim();
  if (!input.canonicalUrl || !name || !city) return null;
  const id = `${input.canonicalUrl}#business`;
  const offers = buildServiceOffers([...(input.services ?? [])], id);
  const sameAs = (input.sameAs ?? []).filter((u) => /^https:\/\//i.test(u));
  const out: JsonObject = {
    "@type": "LocalBusiness",
    "@id": id,
    name,
    url: input.canonicalUrl,
    address: { "@type": "PostalAddress", addressLocality: city },
    areaServed: city,
  };
  if (input.description?.trim()) out.description = input.description.trim();
  if (input.imageUrl?.trim()) out.image = input.imageUrl.trim();
  if (input.inLanguage?.trim()) out.inLanguage = input.inLanguage.trim();
  if (sameAs.length > 0) out.sameAs = sameAs;
  const range = priceRangeOf(input.services);
  if (range) out.priceRange = range;
  if (offers.length > 0) out.hasOfferCatalog = { "@type": "OfferCatalog", name, itemListElement: offers };
  return out;
}

/** Adds the business to a page's JSON-LD as a `@graph` (no-op without one). */
export function withLocalBusiness(
  pageLd: Record<string, unknown> | null,
  business: JsonObject | null,
): Record<string, unknown> | null {
  if (!pageLd || !business) return pageLd;
  const { "@context": context, ...page } = pageLd;
  return { "@context": context ?? "https://schema.org", "@graph": [page, business] };
}
