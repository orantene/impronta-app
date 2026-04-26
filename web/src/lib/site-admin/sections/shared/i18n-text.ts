/**
 * Phase 9 — per-field locale storage primitive.
 *
 * Schemas declare a translatable text field as `i18nString` instead of
 * plain `z.string()`. The shape accepts EITHER:
 *
 *   - a plain string                       (legacy / single-locale row)
 *   - `{ default: string, en?: string, es?: string, ... }`  (per-locale)
 *
 * The renderer picks the active locale's value via `pickI18n()` with
 * a fallback chain. Existing rows keep working — the union shape
 * means a section can store strings today and switch to a per-locale
 * map tomorrow without a backfill migration.
 *
 * The Editor surface is opt-in; `LocalizedTextInput` (separate file)
 * exposes a per-locale tabbed input. The auto-bound ZodSchemaForm
 * still renders i18n fields as plain text (writes to `default`); the
 * operator can switch to the per-locale tabs by clicking the
 * "translate" affordance next to the field.
 *
 * Auto-translate via `translateSectionWithAi` writes to the
 * appropriate locale slot when the section opts in.
 */

import { z } from "zod";

const localeMapSchema = z
  .object({
    default: z.string().max(20000).optional(),
    en: z.string().max(20000).optional(),
    es: z.string().max(20000).optional(),
    fr: z.string().max(20000).optional(),
    pt: z.string().max(20000).optional(),
    "pt-BR": z.string().max(20000).optional(),
    it: z.string().max(20000).optional(),
    de: z.string().max(20000).optional(),
    ja: z.string().max(20000).optional(),
  })
  .catchall(z.string().max(20000));

/**
 * Field validator. Accepts plain string OR locale-map. Use this
 * anywhere a section currently uses `z.string()` for a translatable
 * field; existing data keeps parsing.
 */
export const i18nString = z.union([z.string().max(20000), localeMapSchema]);

export type I18nString = z.infer<typeof i18nString>;
export type I18nLocaleMap = z.infer<typeof localeMapSchema>;

const FALLBACK_LOCALES: ReadonlyArray<string> = ["en", "default"];

/**
 * Resolve a translatable value for the given locale.
 *
 * Order:
 *   1. Exact locale match (e.g. "es-MX")
 *   2. Language-only match (e.g. "es")
 *   3. "en"
 *   4. "default"
 *   5. Empty string
 *
 * Plain strings always return as-is regardless of locale.
 */
export function pickI18n(value: I18nString | undefined | null, locale: string): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value !== "object") return "";
  const map = value as Record<string, unknown>;

  // 1) exact match
  const exact = map[locale];
  if (typeof exact === "string" && exact.length > 0) return exact;

  // 2) language-only (e.g. "es-MX" → "es")
  const dashIdx = locale.indexOf("-");
  if (dashIdx > 0) {
    const lang = locale.slice(0, dashIdx);
    const langValue = map[lang];
    if (typeof langValue === "string" && langValue.length > 0) return langValue;
  }

  // 3-4) en / default
  for (const fallback of FALLBACK_LOCALES) {
    const v = map[fallback];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return "";
}

/**
 * Set the value for `locale` on a localized field. If the existing
 * value is a plain string, we promote it into a locale map first
 * (preserving the original under `default`).
 */
export function setI18n(
  value: I18nString | undefined,
  locale: string,
  next: string,
): I18nString {
  if (typeof value === "string") {
    return { default: value, [locale]: next } as I18nString;
  }
  if (!value) {
    return { [locale]: next } as I18nString;
  }
  return { ...value, [locale]: next } as I18nString;
}

/**
 * Returns the list of locales that have a non-empty value, in
 * declaration order. Used for "translation status" badges.
 */
export function listI18nLocales(value: I18nString | undefined | null): ReadonlyArray<string> {
  if (!value || typeof value === "string") return [];
  const map = value as Record<string, unknown>;
  return Object.entries(map)
    .filter(([, v]) => typeof v === "string" && v.length > 0)
    .map(([k]) => k);
}
