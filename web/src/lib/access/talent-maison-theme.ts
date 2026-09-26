/**
 * Dark-launch switch for the Maison free-website theme (Theme Gallery + setup).
 *
 * OFF unless `TALENT_MAISON_THEME_ENABLED` is exactly "true" or "1". Same shape
 * as `talent-free-website.ts` / `talent-theme-gallery.ts`.
 *
 * Why a fourth flag: the three existing talent-site flags are already on in
 * production. Shipping Maison into the catalog without its own switch would
 * show a half-built theme to real talents.
 */
export function isTalentMaisonThemeEnabled(): boolean {
  const raw = process.env.TALENT_MAISON_THEME_ENABLED?.trim().toLowerCase();
  return raw === "true" || raw === "1";
}
