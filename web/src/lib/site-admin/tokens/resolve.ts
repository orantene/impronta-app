/**
 * Phase 5 / M6 — token resolution + CSS injection surface.
 *
 * The public storefront renders governed design tokens by merging platform
 * defaults with the tenant's LIVE `theme_json` (never the draft). The result
 * feeds two projections:
 *
 *   1. `designTokensToCssVars(tokens)` — returns a `Record<varName, value>`
 *      for every token that has a direct CSS custom-property representation.
 *      Spread into an element `style={...}` prop (Next supports CSS custom
 *      properties in the server-rendered `style` object).
 *
 *   2. `designTokensToDataAttrs(tokens)` — returns `data-token-*` attributes
 *      for enum-shaped tokens (typography presets, radius preset, spacing
 *      preset). These are meant to be targeted by rules in `globals.css`
 *      (e.g. `html[data-token-typography-heading-preset="serif"] { ... }`)
 *      which is how the app already handles `data-public-font-preset`.
 *
 * Why two projections?
 *   - Colors have a universal CSS value (hex string) and can be sprayed as
 *     custom properties without touching the stylesheet.
 *   - Enums map to *sets* of values (Inter vs Playfair vs Cinzel, or 0px /
 *     4px / 8px / 12px). Inlining them as custom properties would require
 *     a JS switch for every possible enum value; data-attribute selectors
 *     keep the lookup table in CSS where it belongs.
 *
 * Isolation guarantee (the M6 rule):
 *   - This module is the ONLY runtime path from theme_json to the DOM.
 *     Everything else (M1 primary_color, saveBranding) stays on the
 *     existing branding pathway. A token that isn't in the registry never
 *     becomes an attribute or a CSS var — validateThemePatch guarantees
 *     the storage map only contains registry keys, and this module only
 *     projects registry keys whose `scope` has a projection rule.
 */

import type { TokenSpec } from "./registry";
import { TOKEN_REGISTRY, tokenDefaults } from "./registry";

/** Minimal row shape accepted by `resolveDesignTokens`. */
export interface ResolveDesignTokensInput {
  /**
   * The LIVE token map. Either `Record<string, string>` (M6 normalised
   * shape) or `Record<string, unknown>` (defensive — older rows may still
   * hold pre-validation values). Non-string values are ignored.
   */
  theme_json?: Record<string, unknown> | null;
}

/**
 * Merge platform defaults with the tenant's live theme_json overrides.
 * Unknown keys in `theme_json` (tokens retired since publish) are dropped
 * silently; non-string values are ignored; missing keys fall through to
 * the registry default. Never throws.
 */
export function resolveDesignTokens(
  branding?: ResolveDesignTokensInput | null,
): Record<string, string> {
  const out: Record<string, string> = { ...tokenDefaults() };
  const live = branding?.theme_json;
  if (!live || typeof live !== "object") return out;

  for (const [key, value] of Object.entries(live)) {
    const spec = TOKEN_REGISTRY[key];
    if (!spec) continue; // registry retired this key; defaults win.
    if (typeof value !== "string") continue; // legacy/unexpected shape.
    out[key] = value;
  }
  return out;
}

// ---- CSS var projection ---------------------------------------------------

/**
 * Map of registry key → CSS custom property name. Only color tokens are
 * projected as raw custom properties; enum tokens (typography / radius /
 * spacing) ship via data-attrs because their "value" is a key into a
 * stylesheet table, not a literal CSS value.
 *
 * The `--token-*` prefix keeps these vars in their own namespace so a
 * future stylesheet change can map them into (or bypass) shadcn's
 * `--primary` / `--background` / etc. without either path silently
 * stomping the other.
 */
const COLOR_VAR_NAMES: Readonly<Record<string, string>> = {
  "color.primary": "--token-color-primary",
  "color.secondary": "--token-color-secondary",
  "color.accent": "--token-color-accent",
  "color.neutral": "--token-color-neutral",
  "color.background": "--token-color-background",
  // M7 editorial extensions
  "color.blush": "--token-color-blush",
  "color.sage": "--token-color-sage",
  "color.ink": "--token-color-ink",
  "color.muted": "--token-color-muted",
  "color.line": "--token-color-line",
  "color.surface-raised": "--token-color-surface-raised",
  // Phase 13 — free font-family overrides (CSS vars consumed by the
  // storefront stylesheet's `--site-heading-font` / `--site-body-font`
  // resolver chain).
  "typography.heading-font-family": "--token-typography-heading-font-family",
  "typography.body-font-family": "--token-typography-body-font-family",
  // Phase 13 — per-heading-level type-scale overrides.
  "typography.h1-size": "--token-typography-h1-size",
  "typography.h2-size": "--token-typography-h2-size",
  "typography.h3-size": "--token-typography-h3-size",
  "typography.h4-size": "--token-typography-h4-size",
  "typography.h5-size": "--token-typography-h5-size",
  "typography.h6-size": "--token-typography-h6-size",
  "typography.body-size": "--token-typography-body-size",
};

/**
 * Project resolved tokens into CSS custom properties. Only tokens with a
 * projection rule are emitted; everything else is left for `designTokensToDataAttrs`.
 * Returns an empty object if no color tokens are present (shouldn't happen
 * — defaults always include the registry color tokens — but defensive).
 */
export function designTokensToCssVars(
  tokens: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [tokenKey, cssVar] of Object.entries(COLOR_VAR_NAMES)) {
    const value = tokens[tokenKey];
    if (typeof value === "string" && value.length > 0) {
      out[cssVar] = value;
    }
  }
  return out;
}

// ---- data-attr projection -------------------------------------------------

/**
 * Map of registry key → HTML data-attribute name. The storefront CSS
 * targets these via `html[data-token-...="..."]` rules. Keep names
 * kebab-cased and prefixed with `data-token-` so they're grep-able and
 * can't collide with the existing `data-public-font-preset` / `data-site-theme`.
 */
const DATA_ATTR_NAMES: Readonly<Record<string, string>> = {
  "typography.heading-preset": "data-token-typography-heading-preset",
  "typography.body-preset": "data-token-typography-body-preset",
  "radius.base": "data-token-radius-base",
  "spacing.scale": "data-token-spacing-scale",
  // M7 editorial extensions
  "typography.label-preset": "data-token-typography-label-preset",
  "typography.scale-preset": "data-token-typography-scale-preset",
  "typography.tracking-preset": "data-token-typography-tracking-preset",
  "radius.scale-preset": "data-token-radius-scale-preset",
  "shadow.preset": "data-token-shadow-preset",
  "motion.preset": "data-token-motion-preset",
  "density.section-padding": "data-token-density-section-padding",
  "density.container-width": "data-token-density-container-width",
  "icon.family": "data-token-icon-family",
  "shell.header-variant": "data-token-shell-header-variant",
  "shell.header-sticky": "data-token-shell-header-sticky",
  "shell.header-transparent-on-hero": "data-token-shell-header-transparent-on-hero",
  "shell.footer-variant": "data-token-shell-footer-variant",
  "shell.mobile-nav-variant": "data-token-shell-mobile-nav-variant",
  "background.mode": "data-token-background-mode",
  // M7.1 template families
  "template.directory-card-family": "data-token-template-directory-card-family",
  "template.profile-layout-family": "data-token-template-profile-layout-family",
  // M8 shell + badge + profile controls
  "shell.logo-variant": "data-token-shell-logo-variant",
  "motion.stagger-preset": "data-token-motion-stagger-preset",
  "directory.card.show-destination-ready-ribbon":
    "data-token-card-ribbon",
  "directory.card.show-starting-from-price": "data-token-card-price",
  "directory.card.specialty-chips-max": "data-token-card-chips-max",
  "profile.sticky-inquiry-bar": "data-token-profile-sticky-bar",
  "profile.blocks-visibility": "data-token-profile-blocks",
};

/**
 * Project resolved tokens into `data-token-*` attributes. Emits one entry
 * per mapped token; callers spread the result into JSX attrs on the root
 * element. Values are passed through verbatim (registry validators have
 * already restricted them to a closed enum).
 */
export function designTokensToDataAttrs(
  tokens: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [tokenKey, attrName] of Object.entries(DATA_ATTR_NAMES)) {
    const value = tokens[tokenKey];
    if (typeof value === "string" && value.length > 0) {
      out[attrName] = value;
    }
  }
  return out;
}

// ---- audit helpers (dev/test) --------------------------------------------

/**
 * List the registry specs whose scope has a projection rule. Used by tests
 * to assert that every agency-configurable token has either a CSS var or
 * a data-attr mapping — forgetting to wire a new token would silently
 * make it a no-op at render time.
 */
export function listProjectedTokens(): ReadonlyArray<TokenSpec> {
  return Object.values(TOKEN_REGISTRY).filter(
    (spec) =>
      COLOR_VAR_NAMES[spec.key] !== undefined ||
      DATA_ATTR_NAMES[spec.key] !== undefined,
  );
}
