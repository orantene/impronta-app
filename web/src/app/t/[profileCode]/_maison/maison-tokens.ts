/**
 * Maison's own palette, as a TOKEN MAP.
 *
 * WHY THIS FILE EXISTS. maison-styles.tsx writes every colour as
 * `var(--token-color-x, <fallback>)`, and for a while we believed the fallback
 * was what the page shipped with. It is not. The app shell sets a full default
 * token set inline on <html> for every page:
 *
 *   --token-color-primary:#111111  --token-color-accent:#0ea5e9
 *   --token-color-ink:#111111      --token-color-surface-raised:#ffffff
 *   --token-color-muted:#8c7f75    --token-color-line:#e5dcce
 *
 * A CSS fallback only applies when the custom property is NOT set anywhere up
 * the tree. Because the shell always sets these, every Maison fallback is
 * unreachable and the template rendered near-black with a sky-blue accent
 * instead of its rose. Measured on /dev/jor-beauty 2026-09-23.
 *
 * So the design has to be declared as tokens, at a level that beats <html>.
 * The template applies these on its own root, UNDER the tenant's themeVars:
 *
 *   style={{ ...MAISON_DEFAULT_TOKENS, ...themeVars }}
 *
 * which gives the three behaviours we want and nothing else:
 *   - tenant has set no colours  → Maison's rose (themeVars is empty)
 *   - tenant has set colours     → the tenant wins, key by key
 *   - shell defaults             → always beaten, because .mn-root is deeper
 *
 * This is also the map a gallery Look would carry, so the template's shipped
 * appearance and a "blush-rose" Look are the same thing expressed once.
 *
 * KEEP IN SYNC with the fallbacks in maison-styles.tsx. Those are now belt and
 * braces for a surface that renders the template outside the shell; this file
 * is what actually paints the page.
 */

export const MAISON_DEFAULT_TOKENS: Record<string, string> = {
  "--token-color-background": "#FFFFFF",
  "--token-color-ink": "#241F26",
  "--token-color-muted": "#665F6B",
  "--token-color-primary": "#A82458",
  "--token-color-accent": "#F4D7E2",
  "--token-color-surface-raised": "#FFF5F8",
  "--token-color-line": "#EDE8EB",
};
