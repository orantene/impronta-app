import { CARD_FAMILY_TOKEN_KEY } from "./CardDesignStudio-3";
import { CARD_COLOR_KNOBS } from "./CardDesignStudio-3";

/**
 * Every registry token the Card Design Studio owns: it seeds the panel from
 * these and persists exactly these on save/publish. Extracted from
 * CardDesignStudio-3 to keep that file under the max-lines cap.
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

