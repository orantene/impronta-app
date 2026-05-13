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
  givenName?: string | null;
  familyName?: string | null;
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

  const person: Record<string, JsonValue> = compact({
    "@type": "Person",
    name: input.name.trim(),
    givenName: input.givenName?.trim() ?? null,
    familyName: input.familyName?.trim() ?? null,
    jobTitle: input.jobTitle?.trim() ?? null,
    description: input.description?.trim() ?? null,
    url: input.canonicalUrl,
    image: input.imageUrl ?? null,
    address: hasAddress ? addressObj : null,
    sameAs: input.sameAs && input.sameAs.length > 0 ? input.sameAs : null,
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
