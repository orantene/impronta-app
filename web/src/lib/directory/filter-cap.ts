/**
 * Phase 5/6 M6 — pure counter + cap for applied directory filters.
 *
 * Dead code until wired in a follow-up slice. The hub directory needs a
 * ceiling on how many filter chips can be applied at once, for two
 * reasons spelled out in docs/saas/phase-5-6/m6-scope-pre-m0.md §2D:
 *
 *   1. Query-complexity bound: each extra facet widens the search-RPC
 *      plan; past ~8 concurrent constraints result sets skew sparse and
 *      the UX stops being useful.
 *   2. Visual bound: chip rows wrap unreadably once the count climbs.
 *
 * This module exposes a pure `countAppliedDirectoryFilters` over the
 * same inputs the sidebar already tracks, plus a single constant
 * `DIRECTORY_FILTER_CAP`. No URL/state knowledge; caller decides what
 * to do once `count >= cap` (disable toggles, show the block chip, etc.).
 *
 * Kept in `lib/directory` (not `components/directory`) because both the
 * sidebar AND the mobile filters drawer will need the same count — a
 * client component co-located with either one would force a second copy.
 */

import type { DirectoryFieldFacetSelection } from "@/lib/directory/types";

/**
 * Maximum simultaneously-applied filter chips. 8 is the product-agreed
 * number (see scope doc §2D): high enough that realistic multi-facet
 * queries fit, low enough that chips stay on one or two rows at the
 * sidebar width and query plans remain bounded.
 */
export const DIRECTORY_FILTER_CAP = 8;

export type DirectoryFilterCountInput = {
  /** Taxonomy term IDs currently selected (talent type, fit labels, etc.). */
  selectedTaxonomyIds: readonly string[];
  heightMinCm: number | null;
  heightMaxCm: number | null;
  ageMin: number | null;
  ageMax: number | null;
  /** Free-text query; whitespace-only counts as empty. */
  query: string | null;
  /** Canonical location slug; empty string counts as empty. */
  locationSlug: string | null;
  /** `ff` facet selections — each non-empty entry counts as one chip. */
  fieldFacets: readonly DirectoryFieldFacetSelection[];
};

function hasHeightRange(min: number | null, max: number | null): boolean {
  return typeof min === "number" || typeof max === "number";
}

function hasAgeRange(min: number | null, max: number | null): boolean {
  return typeof min === "number" || typeof max === "number";
}

function hasQuery(query: string | null): boolean {
  return typeof query === "string" && query.trim().length > 0;
}

function hasLocation(slug: string | null): boolean {
  return typeof slug === "string" && slug.length > 0;
}

function countFieldFacets(facets: readonly DirectoryFieldFacetSelection[]): number {
  let n = 0;
  for (const facet of facets) {
    if (facet.values.length > 0) n += 1;
  }
  return n;
}

/**
 * Counts the number of "chip-equivalent" filters currently applied.
 *
 * Counting rules (chosen to match what the user sees as a chip):
 *   - each selected taxonomy id        → 1
 *   - height range (any bound set)     → 1 (pair shown as one chip)
 *   - age range (any bound set)        → 1 (same rule as height)
 *   - non-empty query string           → 1
 *   - non-empty location slug          → 1
 *   - each non-empty field-facet entry → 1 (multi-value facet = 1 chip)
 *
 * A single-sided range (only min, or only max) still counts as one —
 * the chip renders it either way. Empty `fieldFacets` entries
 * (`values: []`) do NOT count, matching how the sidebar renders chips.
 */
export function countAppliedDirectoryFilters(
  input: DirectoryFilterCountInput,
): number {
  return (
    input.selectedTaxonomyIds.length +
    (hasHeightRange(input.heightMinCm, input.heightMaxCm) ? 1 : 0) +
    (hasAgeRange(input.ageMin, input.ageMax) ? 1 : 0) +
    (hasQuery(input.query) ? 1 : 0) +
    (hasLocation(input.locationSlug) ? 1 : 0) +
    countFieldFacets(input.fieldFacets)
  );
}

/**
 * True when adding one more filter would exceed `DIRECTORY_FILTER_CAP`.
 * Cheap helper so toggle handlers don't have to repeat the comparison.
 */
export function isDirectoryFilterCapReached(
  input: DirectoryFilterCountInput,
  cap: number = DIRECTORY_FILTER_CAP,
): boolean {
  return countAppliedDirectoryFilters(input) >= cap;
}
