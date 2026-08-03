/**
 * Token-key constants for the Card Design Studio.
 *
 * IMPORT-FREE ON PURPOSE. This module used to import CARD_FAMILY_TOKEN_KEY and
 * CARD_COLOR_KNOBS from ./CardDesignStudio-3 while CardDesignStudio-3
 * re-exported CARD_DESIGN_TOKEN_KEYS from here — a two-module cycle. In the
 * production chunk graph CardDesignStudio-3 evaluated first, hit the re-export
 * above its own const declarations, and this module then read CARD_COLOR_KNOBS
 * inside its temporal dead zone: `ReferenceError: Cannot access 'oo' before
 * initialization` at module evaluation, which took down the ENTIRE admin shell
 * on production (2026-08-03 sev-1; dev chunking masked it, so tsc / lint /
 * `next build` / dev QA were all green). Keep this file dependency-free: keys
 * live here, UI vocabulary (labels/hints) lives in CardDesignStudio-3, and the
 * import direction is strictly CardDesignStudio-* → this file. The key-parity
 * contract with CARD_COLOR_KNOBS is pinned in
 * lib/site-admin/edit-mode/save-card-design-tokens-merge.test.ts.
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
 * Every registry token the Card Design Studio owns: it seeds the panel from
 * these and persists exactly these on save/publish. Extracted from
 * CardDesignStudio-3 to keep that file under the max-lines cap.
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
  // Layout DEFAULTS — a section that set its own value keeps it.
  "directory.card.style",
  "directory.card.aspect",
  "directory.card.hover",
  "directory.card.density",
];
