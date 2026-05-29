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

export type {
  DiscoverTalentListItem,
  DiscoverMapPoint,
  DirectoryFacets,
  DiscoverSort,
};

/** Page size for the grid/list incremental load. Shared by page + action. */
export const DIRECTORY_PAGE_SIZE = 24;

/** How many talent-type pills sit in the top bar before the rest collapse
 *  into a "More" overflow. Derive-top-N-by-count (product decision). */
export const DIRECTORY_TOP_TYPES = 6;

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

export function locationLine(city: string | null, country: string | null): string | null {
  const c = (city ?? "").trim();
  const co = (country ?? "").trim();
  if (!c) return co.length > 0 ? co : null;
  if (!co) return c;
  // Stored city labels sometimes already include the country
  // ("Cancún, Quintana Roo, Mexico") — don't append it a second time.
  if (c.toLowerCase().endsWith(co.toLowerCase())) return c;
  return `${c}, ${co}`;
}
