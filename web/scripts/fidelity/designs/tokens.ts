/**
 * Shared registry-font tokens for the rebuilt fidelity designs.
 *
 * Each value is the EXACT `cssFamily` string from BUILDER_FONT_REGISTRY
 * (fonts-registry.ts). Using the full string (not the bare family) means:
 *  - `collectBuilderNodeFontFamilies()` reads the first family ("Fraunces", …)
 *    so the font bridge marks it required + the capture self-check enforces it,
 *  - the renderer emits that family via `--bn-*-font-family`, matching the
 *    bundled `@font-face` (family name) the bridge self-hosts.
 *
 * ALL faces here are BUNDLED (self-hosted woff2) — no Google CDN dependency, so
 * captures stay offline and the determinism self-test never races a network
 * font load. Headings/paragraphs default to non-existent `--site-*-font` vars in
 * the standalone harness, so every text node MUST set `style.fontFamily`
 * explicitly or it silently falls back to the body Arial.
 */

/** Display serif — high-contrast, editorial. Editorial archetype headlines. */
export const FRAUNCES = '"Fraunces", var(--font-fraunces), Georgia, serif';
/** Display serif — classic fashion masthead. Agency archetype headlines. */
export const PLAYFAIR =
  '"Playfair Display", var(--font-playfair-display), Georgia, serif';
/** All-caps Roman caps — luxury labels/eyebrows. */
export const CINZEL = '"Cinzel", var(--font-cinzel), Georgia, serif';
/** Neutral grotesque body. Editorial + agency body copy. */
export const INTER = '"Inter", var(--font-inter-body), system-ui, sans-serif';
/** Geometric humanist sans — product UI. SaaS archetype headlines + body. */
export const GEIST = '"Geist", var(--font-geist-sans), system-ui, sans-serif';
/** Monospace — code/usage surfaces. SaaS console card. */
export const GEIST_MONO =
  '"Geist Mono", var(--font-geist-mono), ui-monospace, "SF Mono", Menlo, monospace';
/** Humanist sans — warm body. Agency body copy. */
export const RALEWAY = '"Raleway", var(--font-body-sans), system-ui, sans-serif';
