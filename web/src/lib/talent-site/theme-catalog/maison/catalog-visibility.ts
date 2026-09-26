/**
 * Maison catalog visibility — flag-gated.
 *
 * When `TALENT_MAISON_THEME_ENABLED` is off, no Maison Design / Look / Demo
 * slug may appear in `loadTalentThemeCatalog` (DB rows or built-ins fallback).
 * Slug convention (PR 1 seeds): `maison`, `maison-<palette>`, `maison-<demo>`.
 */
export const MAISON_DESIGN_SLUG = "maison";

/** True for Maison Design, scoped Looks (`maison-pink`, …), and Demos (`maison-nails`). */
export function isMaisonCatalogSlug(slug: string): boolean {
  const s = slug.trim().toLowerCase();
  return s === MAISON_DESIGN_SLUG || s.startsWith("maison-");
}

/**
 * Drop Maison-owned catalog rows when the Maison flag is off.
 * When the flag is on, return rows unchanged.
 */
export function filterCatalogRowsForMaisonFlag<T extends { slug: string }>(
  rows: readonly T[],
  maisonEnabled: boolean,
): T[] {
  if (maisonEnabled) return [...rows];
  return rows.filter((row) => !isMaisonCatalogSlug(row.slug));
}
