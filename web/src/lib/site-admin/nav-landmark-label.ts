/**
 * Accessible label for the primary `<nav>` landmark.
 *
 * Seeds and templates store the English sentinel `Primary`. At render time we
 * localize that default (and an empty/missing value) so Spanish pages read
 * `Principal` without a per-tree rebuild. Custom authored labels pass through.
 */

import { pickLocale } from "@/lib/i18n/pick-locale";

export const NAV_LANDMARK_ARIA_DEFAULT = {
  en: "Primary",
  es: "Principal",
} as const;

export function navLandmarkAriaLabel(
  locale: string | null | undefined,
  authored?: string | null,
): string {
  const raw = authored?.trim();
  if (raw && raw !== NAV_LANDMARK_ARIA_DEFAULT.en) return raw;
  return pickLocale(locale, NAV_LANDMARK_ARIA_DEFAULT);
}
