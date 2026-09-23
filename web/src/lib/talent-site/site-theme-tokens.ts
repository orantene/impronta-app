/**
 * Talent Max site: EFFECTIVE THEME TOKENS (pure).
 *
 * Render order, lowest to highest: registry defaults (inside the CSS) →
 * platform default theme → SITE tokens (the theme gallery's Look layer, from
 * `talent_sites.design_tokens`) → the page's own `__design` tokens (Web Office
 * per-page override, which today replaces the whole map).
 *
 *   no site tokens         → page non-empty ? page : platform default
 *                            (exactly the pre-gallery expression, same object)
 *   site tokens set        → platform default + site tokens + page tokens,
 *                            so a page override wins key by key and the Look
 *                            fills every key the page does not set
 *
 * Every site without gallery tokens therefore renders byte-identically.
 */
export function resolveEffectiveSiteTokens(
  pageTokens: Record<string, string>,
  siteTokens: Readonly<Record<string, string>>,
  platformTokens: Record<string, string>,
): Record<string, string> {
  const hasPage = Object.keys(pageTokens).length > 0;
  const hasSite = Object.keys(siteTokens).length > 0;
  if (!hasSite) return hasPage ? pageTokens : platformTokens;
  return hasPage
    ? { ...platformTokens, ...siteTokens, ...pageTokens }
    : { ...platformTokens, ...siteTokens };
}
