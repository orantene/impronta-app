/**
 * Shared registry-font tokens for the productised page-design templates.
 *
 * Each value is the EXACT `cssFamily` string from BUILDER_FONT_REGISTRY
 * (fonts-registry.ts): the leading quoted family ("Fraunces", …) is what the
 * builder's font collector reads to mark the face required + emit the webfont,
 * and the `var(--font-*)` token matches the app's next/font CSS variables when
 * present. The trailing system fallback keeps text legible if a face fails to
 * load on a given tenant host.
 *
 * Canonical home: this module. The fidelity harness re-exports the page-design
 * trees from here, so the faces a tenant actually picks ARE the faces the
 * harness scores — keep this list in lockstep with the harness expectations.
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
/** Contemporary characterful grotesque display — festival masthead/poster idiom. */
export const BRICOLAGE = '"Bricolage Grotesque", system-ui, sans-serif';
/** Geometric humanist sans — clean body/labels. Festival body + nav + meta. */
export const MANROPE = '"Manrope", system-ui, sans-serif';
