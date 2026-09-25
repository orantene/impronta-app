/**
 * Guest dock Projects tab label when a trade overrides the i18n default
 * ("Mis citas" / "Yours"). Only returns a string when `customers.chat_bookings`
 * is set on the preset (or tenant override); otherwise null keeps i18n.
 *
 * Mockup: private chef → "Mis eventos"; salon/massage keep "Mis citas".
 */

import type { WordsLookup } from "./resolve";

export function chatBookingsLabel(
  words: Pick<WordsLookup, "word" | "sourceOf">,
): string | null {
  const key = "customers.chat_bookings";
  if (words.sourceOf(key) === "default") return null;
  const label = words.word(key).trim();
  return label.length > 0 ? label : null;
}
