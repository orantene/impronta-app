import type { Locale } from "@/i18n/config";

/**
 * Plan §5: on `/es/…`, show published Spanish when present; otherwise that field falls back to English.
 * Stale Spanish is still shown (non-empty `bio_es`).
 */
export function publicBioForLocale(
  locale: Locale,
  bio_en: string | null | undefined,
  bio_es: string | null | undefined,
): string {
  const en = (bio_en ?? "").trim();
  const es = (bio_es ?? "").trim();
  if (locale !== "es") return en;
  if (!es) return en;
  return es;
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
