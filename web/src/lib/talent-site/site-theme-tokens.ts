/**
 * Talent Max site: EFFECTIVE THEME TOKENS (pure).
 *
 * Render order, lowest to highest: registry defaults (inside the CSS) →
 * platform default theme → SITE tokens (the theme gallery's Look layer, from
 * `talent_sites.design_tokens`) → the page's own `__design` tokens (Web Office
 * per-page override, which today replaces the whole map).
 *
 *   page tokens non-empty  → page tokens            (unchanged behaviour)
 *   else site tokens set   → platform default + site tokens
 *   else                   → platform default       (unchanged behaviour)
 *
 * With empty site tokens this is exactly the pre-gallery expression
 * `page non-empty ? page : platformDefault`, so every existing site renders
 * byte-identically.
 */
export function resolveEffectiveSiteTokens(
  pageTokens: Record<string, string>,
  siteTokens: Readonly<Record<string, string>>,
  platformTokens: Record<string, string>,
): Record<string, string> {
  if (Object.keys(pageTokens).length > 0) return pageTokens;
  if (Object.keys(siteTokens).length > 0) return { ...platformTokens, ...siteTokens };
  return platformTokens;
}
