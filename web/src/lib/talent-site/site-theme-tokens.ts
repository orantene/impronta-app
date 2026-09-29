/**
 * Talent Max site: EFFECTIVE THEME TOKENS (pure).
 *
 * Render order, lowest to highest: registry defaults (inside the CSS) →
 * platform default theme → DESIGN defaults (the chosen Design's token
 * defaults: type roles, buttons, shape, spacing) → SITE tokens (the theme
 * gallery's Look layer + the talent's site-wide edits, from
 * `talent_sites.design_tokens`) → the page's own `__design` tokens (Web Office
 * per-page override, which today replaces the whole map).
 *
 *   no site tokens and no design defaults
 *                          → page non-empty ? page : platform default
 *                            (exactly the pre-gallery expression, same object)
 *   otherwise              → platform + design + site + page, so a page
 *                            override wins key by key and each lower layer
 *                            fills every key the layer above does not set
 *
 * Site style keys (`style-tokens.ts`) treat "" as NOT SET: the theme drawer
 * saves its full working map, so an untouched style key arrives as "" and must
 * fall through to the Design default instead of erasing it. That is also how
 * "Reset to design default" works.
 *
 * Every site without gallery tokens or a Design default renders
 * byte-identically.
 */
import { isStyleTokenKey } from "@/lib/site-admin/tokens/style-tokens";

function layer(target: Record<string, string>, source: Readonly<Record<string, string>>): void {
  for (const [key, value] of Object.entries(source)) {
    if (value === "" && isStyleTokenKey(key)) continue;
    target[key] = value;
  }
}

export function resolveEffectiveSiteTokens(
  pageTokens: Record<string, string>,
  siteTokens: Readonly<Record<string, string>>,
  platformTokens: Record<string, string>,
  designDefaults: Readonly<Record<string, string>> = {},
): Record<string, string> {
  const hasPage = Object.keys(pageTokens).length > 0;
  const hasSite = Object.keys(siteTokens).length > 0;
  const hasDesign = Object.keys(designDefaults).length > 0;
  if (!hasSite && !hasDesign) return hasPage ? pageTokens : platformTokens;
  const out: Record<string, string> = { ...platformTokens };
  layer(out, designDefaults);
  layer(out, siteTokens);
  if (hasPage) layer(out, pageTokens);
  return out;
}
