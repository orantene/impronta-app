import type { BuilderPromoNode } from "./types";

/**
 * Defaults for a freshly inserted `promo` block: a slim, dismissible banner for
 * everyone, on every page, using the talent's best live promo. Pop-up options
 * are pre-set (8 seconds, once per session) so switching the look needs no
 * extra setup.
 */
export const PROMO_DEFAULT_PROPS: BuilderPromoNode["props"] = {
  variant: "banner",
  audience: "everyone",
  pagesMode: "all",
  tone: "accent",
  dismissible: true,
  popupStyle: "modal",
  delaySec: 8,
  frequency: "session",
  position: "bottom_right",
  maxCards: 3,
};
