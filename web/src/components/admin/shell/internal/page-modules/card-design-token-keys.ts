/**
 * Card Design Studio token keys + colour knobs — the LEAF of this graph.
 *
 * This module must NOT import from CardDesignStudio-3 (or any Studio file).
 * It previously pulled `CARD_FAMILY_TOKEN_KEY` / `CARD_COLOR_KNOBS` from
 * there while that file re-exported `CARD_DESIGN_TOKEN_KEYS` back from here —
 * a cycle whose evaluation order decided whether the admin shell booted at
 * all (TDZ: "Cannot access 'CARD_FAMILY_TOKEN_KEY' before initialization").
 * Owning the constants here removes the back-edge.
 */

/** The card-family token key that records which kit is active. */
export const CARD_FAMILY_TOKEN_KEY = "template.directory-card-family";

/** The colour knobs the studio exposes, in display order. */
// English `label` / `hint` remain the non-UI fallback; the studio renders
// `t(knob.labelKey)` / `t(knob.hintKey)`.
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
  { key: "card.price-color", label: "Price chip", hint: "The \u201CFrom $X\u201D chip",
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
