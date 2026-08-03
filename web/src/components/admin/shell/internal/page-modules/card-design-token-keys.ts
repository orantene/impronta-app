/**
 * Card Design Studio token constants — the LEAF module of the studio's import
 * graph. Nothing here may import from CardDesignStudio-*.tsx.
 *
 * This file used to import CARD_FAMILY_TOKEN_KEY / CARD_COLOR_KNOBS from
 * CardDesignStudio-3 while Studio-3 re-exported CARD_DESIGN_TOKEN_KEYS from
 * here — a module cycle. Under dev/Turbopack the evaluation order made
 * `CARD_DESIGN_TOKEN_KEYS`'s spread hit Studio-3's binding before it was
 * initialized ("Cannot access 'CARD_FAMILY_TOKEN_KEY' before initialization"),
 * taking the whole admin shell down (same failure family as incident #971).
 * The constants now live here and Studio-3 re-exports them, so the edge only
 * points one way.
 */

/** The card-family token key that records which kit is active. */
export const CARD_FAMILY_TOKEN_KEY = "template.directory-card-family";

/** The color knobs the studio exposes, in display order. English `label` /
 *  `hint` remain the non-UI fallback; the studio renders `t(knob.labelKey)` /
 *  `t(knob.hintKey)`. */
const KNOB_NS = "dashboard.adminCardStudio2.knobs";

export const CARD_COLOR_KNOBS: Array<{
  key: string; label: string; hint: string; labelKey: string; hintKey: string;
}> = [
  { key: "card.surface", label: "Card surface", hint: "Media / panel ground",
    labelKey: `${KNOB_NS}.surfaceLabel`, hintKey: `${KNOB_NS}.surfaceHint` },
  { key: "card.name-color", label: "Name color", hint: "Talent name",
    labelKey: `${KNOB_NS}.nameLabel`, hintKey: `${KNOB_NS}.nameHint` },
  { key: "card.muted", label: "Secondary text", hint: "Type · location · availability",
    labelKey: `${KNOB_NS}.mutedLabel`, hintKey: `${KNOB_NS}.mutedHint` },
  { key: "card.price-color", label: "Price chip", hint: "The “From $X” chip",
    labelKey: `${KNOB_NS}.priceLabel`, hintKey: `${KNOB_NS}.priceHint` },
];

/**
 * Every registry token the Card Design Studio owns: it seeds the panel from
 * these and persists exactly these on save/publish.
 */
export const CARD_DESIGN_TOKEN_KEYS: string[] = [
  CARD_FAMILY_TOKEN_KEY,
  ...CARD_COLOR_KNOBS.map((k) => k.key),
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
