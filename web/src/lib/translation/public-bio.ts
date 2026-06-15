import type { Locale } from "@/i18n/config";
import { resolveLocalized, type LocalizedMap } from "@/lib/i18n/resolve-localized";

/**
 * Locale-first published-bio display via the universal per-locale resolver
 * (talent_profiles.bio_i18n = { "en":"…", "es":"…" }). Pass the tenant's
 * `fallbackChain(locale)` so a missing translation falls back deterministically.
 */
export function publicBioForLocale(
  locale: Locale,
  chain: readonly Locale[],
  bio_i18n: LocalizedMap | null | undefined,
): string {
  return resolveLocalized(bio_i18n, locale, chain).value;
}

/**
 * Source English for editing / admin (coalesce the legacy `short_bio` mirror).
 * Takes the already-extracted English bio string (`bio_i18n.en`).
 */
export function canonicalBioEn(
  bioEn: string | null | undefined,
  short_bio: string | null | undefined,
): string {
  const a = (bioEn ?? "").trim();
  if (a) return a;
  return (short_bio ?? "").trim();
}

/** Convenience: pull the English published bio out of a `bio_i18n` map. */
export function bioEnFromI18n(bio_i18n: LocalizedMap | null | undefined): string | null {
  const v = bio_i18n?.en;
  return typeof v === "string" && v.trim() ? v : null;
}
