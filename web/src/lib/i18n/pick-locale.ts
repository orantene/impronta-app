/**
 * `pickLocale` — the N-language replacement for `locale === "es" ? esExpr : enExpr`.
 *
 * The old ternary form is structurally English-or-Spanish: any locale that is not
 * exactly `"es"` (en, fr, pt, …) falls to the `enExpr` else-branch. That silently
 * caps the platform at two languages — a registry-added `fr` can never surface a
 * French string even once one exists.
 *
 * `pickLocale(locale, { en, es, fr, … })` instead looks up the entry keyed by
 * `locale`; when that key is absent (or its value is `undefined`) it walks
 * `fallback` (default `["en"]`) and finally returns the `en` entry. This means:
 *
 *   - en / es behaviour is BYTE-IDENTICAL to the old ternary (only `en`/`es`
 *     keys exist today, so `es` → es, everything else → en).
 *   - a 3rd locale with no string yet degrades to en exactly as it does today.
 *   - the moment an `fr` entry is supplied it surfaces automatically — no code
 *     change at the call site.
 *
 * Pure, generic, no IO / React — safe in server, client, and edge code.
 *
 * NOTE: for per-locale JSONB *content* maps (`label_i18n` etc.) prefer
 * `resolveLocalized` from `@/lib/i18n/resolve-localized`, which understands the
 * tenant fallback chain and "needs translation" cues. `pickLocale` is for inline
 * code branches that hard-code the en/es alternatives.
 */
import { defaultLocale } from "@/i18n/config";

/** A per-locale entry map. `en` is required so there is always a final fallback. */
export type LocaleEntries<T> = { en: T } & { [locale: string]: T | undefined };

/**
 * Pick the entry for `locale`, falling back through `fallback` (default the app
 * default locale, i.e. `en`) when `locale` has no entry of its own.
 */
export function pickLocale<T>(
  locale: string | null | undefined,
  entries: LocaleEntries<T>,
  fallback: readonly string[] = [defaultLocale],
): T {
  if (locale != null && locale in entries) {
    const v = entries[locale];
    if (v !== undefined) return v as T;
  }
  for (const code of fallback) {
    if (code in entries) {
      const v = entries[code];
      if (v !== undefined) return v as T;
    }
  }
  return entries.en;
}
