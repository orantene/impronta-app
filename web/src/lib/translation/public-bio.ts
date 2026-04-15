import type { Locale } from "@/i18n/config";
import { pickLocalizedString } from "@/lib/i18n/pick-localized-string";

/**
 * Locale-first display with symmetric EN ↔ ES fallback (see Translation Center plan).
 */
export function publicBioForLocale(
  locale: Locale,
  bio_en: string | null | undefined,
  bio_es: string | null | undefined,
): string {
  return pickLocalizedString(locale, bio_en, bio_es);
}

/** Source English for editing / admin (coalesce legacy `short_bio`). */
export function canonicalBioEn(
  bio_en: string | null | undefined,
  short_bio: string | null | undefined,
): string {
  const a = (bio_en ?? "").trim();
  if (a) return a;
  return (short_bio ?? "").trim();
}
