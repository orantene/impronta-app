/**
 * Shared, runtime-safe helpers + view types for the public Global Talent
 * Directory on the marketing surface (apex `tulala.digital/directory`).
 *
 * Plain module — no "use client" / "use server" / "server-only" directive —
 * so the RSC page, the server action, and the client shell can all import
 * it. The bridge data types are pulled in with `import type` (erased at
 * build) so the server-only data module never reaches the client bundle.
 */
import type {
  DiscoverTalentListItem,
  DiscoverMapPoint,
  DirectoryFacets,
  DiscoverSort,
} from "@/app/(workspace)/[tenantSlug]/_data-bridge/discover";
import type { CanonicalTalentCardData } from "@/components/talent-cards/talent-card-shape";
import { AVAILABILITY_UNKNOWN } from "@/lib/site-admin/sections/directory/card-data";
import type { CardDesign } from "@/lib/site-admin/server/card-design-shape";

export type {
  DiscoverTalentListItem,
  DiscoverMapPoint,
  DirectoryFacets,
  DiscoverSort,
};

/**
 * Exact field set the directory card renders. A structural subset shared by the
 * paginated grid items (`DiscoverTalentListItem`) and the map points
 * (`DiscoverMapPoint`, enriched with trust + availability), so both can feed the
 * same `DirectoryTalentCard` with no conversion step.
 */
export type DirectoryCardData = Pick<
  DiscoverTalentListItem,
  // `id` is the stable React key + dedup key the shell needs; carried so the
  // row stays usable as a list item without falling back to the raw bridge type.
  | "id"
  | "displayName"
  | "profileCode"
  | "primaryTypeLabel"
  | "homeCity"
  | "homeCountry"
  | "agencyName"
  | "isExclusive"
  | "headshotUrl"
  | "trustTier"
  | "availableDaysInNext30"
>;

/**
 * The row the marketing card actually renders. `DirectoryCardData` plus the
 * `agencyTenantId` the cross-tenant directory uses to resolve each row's own
 * agency card design (P3). Both grid items (`DiscoverTalentListItem`) and map
 * points (`DiscoverMapPoint`) carry this field, so both feed the card with no
 * extra conversion.
 */
export type DirectoryCardRow = DirectoryCardData & {
  /** Owning agency tenant — present on grid rows (`DiscoverTalentListItem`),
   *  absent on map points (`DiscoverMapPoint` doesn't carry it yet), so it's
   *  optional. When absent the card paints the platform-default design. */
  agencyTenantId?: string | null;
  /**
   * This row's resolved agency card design. The cross-tenant directory page
   * resolves it per `agencyTenantId` (server-side, via `resolveCardDesign`)
   * and rides it along on the SSR rows so each card paints in its own agency's
   * palette without a separate prop channel through the client shell. Rows
   * loaded incrementally (the load-more action) omit it and fall back to the
   * platform default — see `attachCardDesigns`.
   */
  design?: CardDesign;
};

/**
 * Build a `agencyTenantId → CardDesign` lookup, calling `resolve` once per
 * DISTINCT tenant (the directory shows many rows per agency, so we never
 * resolve the same tenant twice in a render). Returned as a plain `Map` the
 * page then uses to enrich rows via `attachCardDesigns`.
 *
 * `resolve` is injected (not imported) so this helper stays framework-free and
 * unit-testable — the server page passes `resolveCardDesign`; the test passes a
 * spy that proves de-duplication + per-tenant distinctness.
 */
export async function resolveCardDesignsForRows<
  T extends { agencyTenantId: string | null },
>(
  rows: readonly T[],
  resolve: (tenantId: string) => Promise<CardDesign>,
): Promise<Map<string, CardDesign>> {
  const ids = Array.from(
    new Set(
      rows
        .map((r) => r.agencyTenantId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );
  const entries = await Promise.all(
    ids.map(async (id) => [id, await resolve(id)] as const),
  );
  return new Map(entries);
}

/**
 * Attach each row's resolved `CardDesign` (looked up by `agencyTenantId`) so
 * the row carries its own palette through the client shell with no extra prop.
 * Rows whose tenant isn't in the map (independents, or a failed resolve) keep
 * `design` unset and the card falls back to the platform default.
 */
export function attachCardDesigns<
  T extends { agencyTenantId: string | null; design?: CardDesign },
>(rows: readonly T[], byTenant: Map<string, CardDesign>): T[] {
  return rows.map((row) => {
    const id = row.agencyTenantId;
    const design = id ? byTenant.get(id) : undefined;
    return design ? { ...row, design } : row;
  });
}

/**
 * Map a directory row to the canonical `<TalentCard>` data shape. The marketing
 * directory is browse-only, so availability is rendered as the restrained
 * "Open N of next 30 days" / "on request" line (never buyer-framed); when the
 * 30-day snapshot is missing we fall through to the ratified unknown string and
 * flag it as unknown so the card dims its dot.
 */
export function toCanonicalCardData(
  talent: DirectoryCardRow,
): CanonicalTalentCardData {
  const days = talent.availableDaysInNext30;
  const known = typeof days === "number" && days > 0;
  return {
    id: talent.profileCode ?? talent.displayName,
    name: talent.displayName,
    profileCode: talent.profileCode,
    profileHref: talent.profileCode ? `/t/${talent.profileCode}` : "",
    primaryType: talent.primaryTypeLabel,
    location: locationLine(talent.homeCity, talent.homeCountry),
    photoUrl: talent.headshotUrl,
    agencyName: talent.agencyName,
    isExclusive: talent.isExclusive,
    availabilityLabel: known
      ? availabilityLine(days).text
      : AVAILABILITY_UNKNOWN,
    availabilityKnown: known,
    availableDaysInNext30: days,
  };
}

/** Page size for the grid/list incremental load. Shared by page + action. */
export const DIRECTORY_PAGE_SIZE = 24;

/** How many talent-type pills sit in the top bar before the rest collapse
 *  into a "More" overflow. Derive-top-N-by-count (product decision). */
export const DIRECTORY_TOP_TYPES = 6;

/** Shared keyboard focus ring for the directory's interactive controls.
 *  Mirrors the search/sort inputs (forest ring, no UA outline) so every
 *  focusable target — cards, rows, pills, toggles, tabs, buttons — gets one
 *  consistent, on-brand focus state. Defined as a literal so Tailwind's
 *  scanner generates the classes; consumers just append it. */
export const FOCUS_RING =
  "outline-none focus-visible:shadow-[0_0_0_4px_var(--plt-forest-ring)]";

export type DirectoryView = "grid" | "list" | "map";

export type DirectoryActiveFilters = {
  q: string | null;
  country: string | null;
  city: string | null;
  /** Taxonomy slug (URL param `tax`) → matview `category_slug`. */
  category: string | null;
  /** Trust ladder tier (basic | verified | silver | gold) → matview `trust_tier`. */
  trustTier: string | null;
  /** Only talents with ≥1 free day in the next 30. */
  availableOnly: boolean;
};

/** Filters that the load-more server action accepts (sort + offset added there). */
export type DirectoryQuery = DirectoryActiveFilters & { sort: DiscoverSort };

export function normalizeView(raw: string | undefined): DirectoryView {
  return raw === "list" || raw === "map" ? raw : "grid";
}

export function normalizeSort(raw: string | undefined): DiscoverSort {
  return raw === "availability" ? "availability" : "recommended";
}

/** Trim → null. Keeps empty query-string values out of the matview filters. */
export function cleanParam(raw: string | undefined): string | null {
  const v = (raw ?? "").trim();
  return v.length > 0 ? v : null;
}

export function isTruthyFlag(raw: string | undefined): boolean {
  return raw === "1" || raw === "true";
}

/**
 * Trust ladder → restrained badge. `basic` (and unknown) get NO badge to keep
 * the grid quiet. `weight` controls forest intensity only — the "gold" tier
 * keeps its name but is NEVER rendered in a gold/rust hue (design guardrail:
 * cool palette only, forest accent).
 */
export function trustTierMeta(
  tier: string | null,
): { label: string; weight: "soft" | "strong" } | null {
  switch ((tier ?? "").toLowerCase()) {
    case "verified":
      return { label: "Verified", weight: "soft" };
    case "silver":
      return { label: "Silver", weight: "soft" };
    case "gold":
      return { label: "Gold", weight: "strong" };
    default:
      return null;
  }
}

const TRUST_TIER_ORDER: Array<{ value: string; label: string }> = [
  { value: "verified", label: "Verified" },
  { value: "silver", label: "Silver" },
  { value: "gold", label: "Gold" },
];

/** Trust tiers to expose as filter rows, in ladder order, intersected with
 *  whatever the facet pass actually found. `basic` is omitted — it's the
 *  unverified default, not a meaningful filter. */
export function orderedTrustFacets(
  facetTiers: Array<{ value: string; count: number }>,
): Array<{ value: string; label: string; count: number }> {
  const byValue = new Map(facetTiers.map((t) => [t.value.toLowerCase(), t.count]));
  return TRUST_TIER_ORDER.map(({ value, label }) => ({
    value,
    label,
    count: byValue.get(value) ?? 0,
  })).filter((t) => t.count > 0);
}

/** First-initial(s) for the no-photo avatar fallback. */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** Subtle agency attribution string. Product decision: "show agency, subtle".
 *  Independent talents read "Independent"; exclusive rosters get a quiet tag. */
export function agencyLine(agencyName: string | null, isExclusive: boolean): string {
  if (!agencyName) return "Independent";
  return isExclusive ? `${agencyName} · exclusive` : agencyName;
}

/** Restrained availability copy. Never buyer-framed; "on request" when the
 *  30-day window is fully blocked or the snapshot is missing. */
export function availabilityLine(
  availableDaysInNext30: number | null,
): { text: string; open: boolean } {
  if (typeof availableDaysInNext30 === "number" && availableDaysInNext30 > 0) {
    return { text: `Open ${availableDaysInNext30} of next 30 days`, open: true };
  }
  return { text: "Availability on request", open: false };
}

/**
 * Gentle title-case for free-text location labels. Only *all-lowercase* tokens
 * are capitalized; any token that already carries an uppercase letter is left
 * exactly as stored. This fixes the common "mexico" / "london" lowercase rows
 * while preserving correctly-cased proper nouns ("Cancún", "McDermott") and
 * acronyms ("USA", "UK", "UAE") — we never down-case what the source already
 * capitalized. Commas, hyphens, apostrophes and spacing survive because we only
 * transform letter/number runs in place.
 */
export function smartTitleCase(input: string): string {
  return input.replace(/[\p{L}\p{N}]+/gu, (token) =>
    token === token.toLowerCase()
      ? token.charAt(0).toUpperCase() + token.slice(1)
      : token,
  );
}

export function locationLine(city: string | null, country: string | null): string | null {
  const c = (city ?? "").trim();
  const co = (country ?? "").trim();
  let line: string;
  if (!c) {
    if (co.length === 0) return null;
    line = co;
  } else if (!co) {
    line = c;
  } else if (c.toLowerCase().endsWith(co.toLowerCase())) {
    // Stored city labels sometimes already include the country
    // ("Cancún, Quintana Roo, Mexico") — don't append it a second time.
    line = c;
  } else {
    line = `${c}, ${co}`;
  }
  return smartTitleCase(line);
}

/** Unit-separator (0x1F) joins the city facet composite key — a control char
 *  that can't appear in a place label, so the split stays unambiguous. Built at
 *  runtime so no literal control byte lives in the source. */
const CITY_FACET_SEP = String.fromCharCode(31);

/** Join a city to its country so the city filter scopes by both. Disambiguates
 *  same-named cities across countries (e.g. "Springfield"). */
export function cityFacetKey(city: string, country: string | null): string {
  return `${city}${CITY_FACET_SEP}${country ?? ""}`;
}

/** Split a composite city key back into its city + (optional) country. */
export function parseCityFacetKey(key: string): { city: string; country: string | null } {
  const idx = key.indexOf(CITY_FACET_SEP);
  if (idx === -1) return { city: key, country: null };
  const country = key.slice(idx + CITY_FACET_SEP.length);
  return { city: key.slice(0, idx), country: country.length > 0 ? country : null };
}
