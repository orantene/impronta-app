/**
 * Talent page structured data — schema.org JSON-LD generators.
 *
 * Phase G PR 1. Produces ProfilePage + Person JSON-LD that Google renders
 * as rich results for talent profiles, and an ItemList for directory /
 * roster pages so the listing surfaces are also crawlable as a
 * structured collection.
 *
 * Notes on choices:
 *  - `ProfilePage` wraps `Person` (mainEntity). This is Google's
 *    recommended shape for personal profile URLs as of 2024+ guidelines.
 *  - We DO NOT emit `birthDate`, `email`, `telephone`, `gender`, or any
 *    PII the talent didn't explicitly publish on the page. The profile
 *    page UI surfaces public info only — JSON-LD mirrors that.
 *  - Locale-aware `inLanguage` on the page so search engines route
 *    English-speaking visitors to the EN canonical and ES to the ES one.
 *  - `sameAs` carries verified social links when present — increases
 *    knowledge-panel chances.
 *  - All strings are pre-trimmed; nullable inputs are dropped from
 *    the JSON entirely (schema.org tolerates omitted fields better
 *    than nulls).
 */

export interface TalentJsonLdInput {
  /** Canonical absolute URL for the profile (tulala.digital/t/...) */
  canonicalUrl: string;
  /** Display name — falls back to first+last, then profile code. */
  name: string;
  // Legal first/last name are deliberately NOT accepted: display name only.
  /** Primary public role: "Model", "Dancer", "MC", etc. */
  jobTitle?: string | null;
  /** Public bio (already locale-resolved). */
  description?: string | null;
  /** Hero image absolute URL. */
  imageUrl?: string | null;
  /** City and (optionally) region/country labels — public residence info. */
  addressLocality?: string | null;
  addressRegion?: string | null;
  addressCountry?: string | null;
  /** ISO dates. */
  createdAt?: string | null;
  updatedAt?: string | null;
  /** Page language: "en" | "es" | etc. */
  inLanguage?: string | null;
  /** Public links the talent owns and verified (Instagram, web, etc.). */
  sameAs?: string[] | null;
  /** Workspace / agency the talent is publicly affiliated with (if any). */
  affiliationName?: string | null;
  affiliationUrl?: string | null;
  /**
   * PUBLISHED services from the talent's offerings catalog (already filtered
   * to what a visitor may see). Emitted as `Person.makesOffer` — one
   * Offer -> Service per entry, provider = this Person. Real data only.
   */
  services?: TalentJsonLdService[] | null;
}

/** The catalog fields JSON-LD may state. Nothing here is derived or invented. */
export interface TalentJsonLdService {
  name: string;
  description?: string | null;
  /** Major-unit price stored as cents; only used when `priceDisplay` is exact/from. */
  amountCents?: number | null;
  currency?: string | null;
  /** exact = state the price, from = minimum price, quote = no price stated. */
  priceDisplay?: "exact" | "from" | "quote" | string | null;
  durationMinutes?: number | null;
}

/** Cap, so a very large catalog cannot bloat the page. */
const MAX_JSON_LD_SERVICES = 20;

/** Minimal structural shape of a catalog offering (see TalentOffering). */
export interface JsonLdOfferingSource {
  kind: string;
  title: string;
  description: string | null;
  priceDisplay: string;
  amountCents: number | null;
  currency: string;
  durationMinutes: number | null;
  visibility?: string;
}

/** Catalog offerings -> JSON-LD services: services/packages only (a product is
 *  not a Service), never agency-only. */
export function offeringsToJsonLdServices(
  offerings: readonly JsonLdOfferingSource[],
): TalentJsonLdService[] {
  return offerings
    .filter((o) => (o.kind === "service" || o.kind === "package") && o.visibility !== "agency_only")
    .map((o) => ({
      name: o.title,
      description: o.description,
      amountCents: o.amountCents,
      currency: o.currency,
      priceDisplay: o.priceDisplay,
      durationMinutes: o.durationMinutes,
    }));
}

type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [k: string]: JsonValue | undefined }
  | JsonValue[];

/** Strip undefined + empty-string entries from an object so the emitted
 *  JSON-LD stays terse and lint-clean for Search Console. */
function compact<T extends Record<string, JsonValue | undefined>>(o: T): Record<string, JsonValue> {
  const out: Record<string, JsonValue> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

export function buildServiceOffers(
  services: TalentJsonLdService[] | null | undefined,
  personId: string,
): JsonValue[] {
  const out: JsonValue[] = [];
  for (const svc of services ?? []) {
    const name = svc.name?.trim();
    if (!name) continue;
    if (out.length >= MAX_JSON_LD_SERVICES) break;
    const currency = svc.currency?.trim().toUpperCase() || null;
    const cents = svc.amountCents;
    const hasAmount =
      typeof cents === "number" && Number.isFinite(cents) && cents > 0 && !!currency;
    const price = hasAmount ? (cents / 100).toFixed(2) : null;
    const exact = hasAmount && svc.priceDisplay === "exact";
    const from = hasAmount && svc.priceDisplay === "from";
    const mins = svc.durationMinutes;
    out.push(
      compact({
        "@type": "Offer",
        itemOffered: compact({
          "@type": "Service",
          name,
          description: svc.description?.trim() ?? null,
          provider: { "@id": personId },
        }),
        price: exact ? price : null,
        priceCurrency: exact ? currency : null,
        priceSpecification: from
          ? { "@type": "PriceSpecification", minPrice: price, priceCurrency: currency }
          : null,
        eligibleDuration:
          typeof mins === "number" && mins > 0
            ? { "@type": "QuantitativeValue", value: mins, unitCode: "MIN" }
            : null,
      }),
    );
  }
  return out;
}

/** Build the JSON-LD object for a single talent profile page.
 *  Returns null only if the input lacks the bare minimum (URL + name)
 *  — caller can skip emitting in that case. */
export function buildTalentProfileJsonLd(input: TalentJsonLdInput): Record<string, JsonValue> | null {
  if (!input.canonicalUrl || !input.name) return null;

  const addressObj = compact({
    "@type": "PostalAddress",
    addressLocality: input.addressLocality?.trim() ?? null,
    addressRegion: input.addressRegion?.trim() ?? null,
    addressCountry: input.addressCountry?.trim() ?? null,
  });
  const hasAddress = Object.keys(addressObj).length > 1; // more than "@type"

  const personId = `${input.canonicalUrl}#person`;
  const offers = buildServiceOffers(input.services, personId);

  const person: Record<string, JsonValue> = compact({
    "@type": "Person",
    "@id": personId,
    name: input.name.trim(),
    jobTitle: input.jobTitle?.trim() ?? null,
    description: input.description?.trim() ?? null,
    url: input.canonicalUrl,
    image: input.imageUrl ?? null,
    address: hasAddress ? addressObj : null,
    sameAs: input.sameAs && input.sameAs.length > 0 ? input.sameAs : null,
    makesOffer: offers.length > 0 ? offers : null,
    affiliation: input.affiliationName
      ? compact({
          "@type": "Organization",
          name: input.affiliationName.trim(),
          url: input.affiliationUrl?.trim() ?? null,
        })
      : null,
  });

  return compact({
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    "@id": input.canonicalUrl,
    url: input.canonicalUrl,
    inLanguage: input.inLanguage?.trim() ?? null,
    dateCreated: input.createdAt ?? null,
    dateModified: input.updatedAt ?? null,
    mainEntity: person,
  });
}

/** Build an ItemList JSON-LD for a directory / roster page listing talent.
 *  Use on `/directory` (public agency storefront) and `/models` (roster
 *  index). Each entry is a thin `Person` with name + URL only — the
 *  per-page JSON-LD on the talent profile carries the full structure. */
export interface RosterItemInput {
  url: string;
  name: string;
  jobTitle?: string | null;
  imageUrl?: string | null;
}

export function buildRosterItemListJsonLd(
  listUrl: string,
  items: RosterItemInput[],
): Record<string, JsonValue> | null {
  if (!items.length) return null;
  return compact({
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": listUrl,
    url: listUrl,
    numberOfItems: items.length,
    itemListElement: items.map((it, idx) => compact({
      "@type": "ListItem",
      position: idx + 1,
      url: it.url,
      item: compact({
        "@type": "Person",
        name: it.name,
        url: it.url,
        jobTitle: it.jobTitle?.trim() ?? null,
        image: it.imageUrl ?? null,
      }),
    })),
  });
}

/** Stringify with stable key order (schema.org doesn't care, but stable
 *  output helps cache + diff). */
export function jsonLdToString(obj: Record<string, JsonValue> | null): string {
  if (!obj) return "";
  return JSON.stringify(obj);
}
