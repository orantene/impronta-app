/**
 * Future migration (plan §8): content still stored in EN/ES-wide columns or asymmetric bios.
 *
 * - `taxonomy_terms.name_en` / `name_es` → `taxonomy_term_translations(term_id, locale, name)` or JSONB map.
 * - `locations` display columns → same pattern.
 * - `talent_profiles` bio_* → `talent_profile_bio_locale(profile_id, locale, published, draft, status)` or JSONB + per-locale workflow table.
 *
 * Dual-write period: app reads new tables first, falls back to wide columns until backfill completes.
 * This module documents intent only; no runtime behavior.
 */
export const WIDE_COLUMN_MIGRATION_TARGETS = [
  "taxonomy_terms",
  "locations",
  "talent_profiles (bio_en/bio_es)",
] as const;
