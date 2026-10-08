/**
 * Locale keying for the legacy -> offerings import.
 *
 * Imported legacy titles/descriptions are written in whatever language the
 * talent authored them in, which is their PRIMARY locale, not always English.
 * Pure so it can be tested without the server action.
 */

import type { LocalizedMap } from "@/lib/i18n/resolve-localized";

/** Primary locale to key imported text under; falls back to `en`. */
export function importLocaleKey(defaultLocale: string | null | undefined): string {
  const l = typeof defaultLocale === "string" ? defaultLocale.trim() : "";
  return l.length > 0 ? l : "en";
}

/** `{ [locale]: text }`, or null when the text is empty. */
export function importI18n(locale: string, text: string | null | undefined): LocalizedMap | null {
  return text ? { [locale]: text } : null;
}
