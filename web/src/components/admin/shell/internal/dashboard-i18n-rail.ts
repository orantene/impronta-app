/**
 * Spanish for the rail's own labels.
 *
 * WHY THIS IS NOT IN dashboard-i18n.ts. That file is grandfathered past
 * eslint's `max-lines` cap and held only by the size ratchet, and every feature
 * adding "just a few strings" is how it reached three and a half thousand
 * lines. `dashboard-i18n-links.ts` made the same call for the QR & Links
 * strings and said so in as many words; this is the same call for the rail's.
 *
 * WHY IT RE-EXPORTS THE LINKS TABLE. A second import and a second spread in
 * `dashboard-i18n.ts` would be two more lines on the file this module exists to
 * stop growing. Folding the links table in here keeps that file at exactly one
 * import and one spread, so a third rail label costs it nothing at all.
 *
 * Every label `lib/workspace/destinations.ts` can draw needs a row somewhere in
 * this chain: the rail renders English literals through `copy.t()`, which is
 * keyed by the English string, so a missing row renders in English on a Spanish
 * workspace and nothing else notices. `rail-visible-pages.static.test.ts` is
 * what says so, and it reads this module as well as the inline table.
 */

import { LINKS_ES_TEXT } from "./dashboard-i18n-links";

export const RAIL_ES_TEXT: Record<string, string> = {
  ...LINKS_ES_TEXT,
  // The three Appointments sub-views (P3). They are tabs of one route, but the
  // rail draws them as rows, so each needs its own literal. "Appointments" is
  // both the destination label and its landing child, and already has a row in
  // the inline table.
  "Sessions and series": "Sesiones y series",
  "Waitlist": "Lista de espera",
};
