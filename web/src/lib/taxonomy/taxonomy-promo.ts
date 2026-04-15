/** Placement keys understood by public surfaces (extend as new widgets ship). */
export const TAXONOMY_PLACEMENT_HOME_BROWSE_BY_TYPE = "home_browse_by_type" as const;

export const TAXONOMY_PROMO_PLACEMENTS = [TAXONOMY_PLACEMENT_HOME_BROWSE_BY_TYPE] as const;

export type TaxonomyPromoPlacement = (typeof TAXONOMY_PROMO_PLACEMENTS)[number];

export function isTaxonomyPromoPlacement(value: string): value is TaxonomyPromoPlacement {
  return (TAXONOMY_PROMO_PLACEMENTS as readonly string[]).includes(value);
}

export function taxonomyPromoStoragePrefix(termId: string): string {
  return `taxonomy/${termId}/`;
}

export function isTaxonomyPromoPathForTerm(termId: string, path: string | null | undefined): boolean {
  if (!path) return false;
  return path.startsWith(taxonomyPromoStoragePrefix(termId));
}

/**
 * True when the DB has not had the taxonomy promo migration applied yet (unknown column).
 * Used to fall back to a slimmer `select()` so admin and home still load.
 */
export function isMissingTaxonomyPromoColumnsError(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  const m = (err.message ?? "").toLowerCase();
  return m.includes("promo_image_storage_path") || m.includes("promo_placements");
}
