/**
 * The canonical CARD-DESIGN publish scope.
 *
 * `agency_branding` stores ONE draft map that several surfaces write to (the
 * Card Design studio, the storefront ThemeDrawer, the site-preset picker), and
 * publish used to promote that whole map. So a one-swatch card edit shipped
 * every unrelated theme change sitting in the draft — that is the 2026-08-15
 * incident where publishing a card colour repainted improntamodels.com white.
 *
 * A scoped publish promotes ONLY these keys onto the live row and leaves every
 * other live token untouched; the unpublished remainder stays in the draft for
 * whoever owns that surface to publish deliberately.
 *
 * IMPORT-FREE ON PURPOSE — this is a leaf module. `card-design-token-keys.ts`
 * (in the shell's page-modules) re-exports from here, and that file carries a
 * hard-won warning about module cycles causing a TDZ sev-1 in the production
 * chunk graph. Keep this file importing nothing so a cycle is impossible.
 */

/** The card-family token key that records which kit is active. */
export const CARD_FAMILY_TOKEN_KEY = "template.directory-card-family";

/** The color-knob token keys, in the studio's display order. */
export const CARD_COLOR_KNOB_KEYS = [
  "card.surface",
  "card.name-color",
  "card.muted",
  "card.price-color",
] as const;

/**
 * Every registry token the Card Design studio owns — the exact set it seeds
 * its panel from, saves, and (now) publishes. Anything NOT in this list is
 * somebody else's surface and must not move when the studio publishes.
 */
export const CARD_DESIGN_TOKEN_KEYS: string[] = [
  CARD_FAMILY_TOKEN_KEY,
  ...CARD_COLOR_KNOB_KEYS,
  // STANDING reviews-on-cards controls (persist + seed the CardDesignStudio panel).
  "directory.card.show-standing",
  "directory.card.standing-style",
  "profile.reviews-visibility",
  // Card features that shipped after the Studio's first cut.
  "directory.card.show-starting-from-price",
  "directory.card.show-quick-view",
  "directory.card.profile-popup",
  // Action ceilings (favorite / inquiry) + the tenant's favorite glyph.
  "directory.card.show-favorite",
  "directory.card.show-inquiry",
  "favorite.icon",
  // Layout DEFAULTS — a section that set its own value keeps it.
  "directory.card.style",
  "directory.card.aspect",
  "directory.card.hover",
  "directory.card.density",
];

/** Set form for O(1) membership checks in the publish path. */
export const CARD_DESIGN_SCOPE: ReadonlySet<string> = new Set(CARD_DESIGN_TOKEN_KEYS);
