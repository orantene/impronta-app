/**
 * Dark-launch switch for the talent theme gallery (Designs + Looks, site-level
 * theme tokens). OFF unless `TALENT_THEME_GALLERY_ENABLED` is exactly "true"
 * or "1": with it off, the gallery actions refuse and the Max-site render never
 * reads the site theme columns, so production behaves exactly as before.
 */
export function isTalentThemeGalleryEnabled(): boolean {
  const raw = process.env.TALENT_THEME_GALLERY_ENABLED?.trim().toLowerCase();
  return raw === "true" || raw === "1";
}
