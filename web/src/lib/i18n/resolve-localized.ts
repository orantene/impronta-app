/**
 * Phase 0 — the ONE universal content resolver.
 *
 * Every translatable value in the platform is stored as a per-locale JSONB map
 * (`label_i18n jsonb = {"en":"Height","es":"Estatura","fr":"Taille"}`). This
 * module is the single read path that replaces every `locale === "es" ? x_es : x_en`
 * branch in the codebase. It is N-language by construction — adding a language is
 * a registry row + data, never a code change here.
 *
 * Pure (no IO, no React, edge-safe). Import the fallback chain from the tenant's
 * resolved locale settings (`TenantLocaleSettings.fallbackChain(locale)`).
 */
import type { Locale } from "@/i18n/config";

/** A per-locale value map as stored in `*_i18n jsonb` columns. */
export type LocalizedMap = Record<string, string | null | undefined>;

export interface ResolvedValue {
  /** Best non-empty value found, or "" when the map is empty. */
  value: string;
  /** true when the value did NOT come from `locale` itself — drives the
   *  builder's "needs translation" cue (40% opacity) and the red status dot. */
  isFallback: boolean;
  /** The locale the returned value actually came from, or null if none. */
  resolvedLocale: Locale | null;
}

function nonEmpty(v: string | null | undefined): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/**
 * Resolve the best value for `locale`, walking `chain` (e.g. ["es","en"]) until a
 * non-empty value is found, then any value in the map as a last resort.
 */
export function resolveLocalized(
  map: LocalizedMap | null | undefined,
  locale: Locale,
  chain: readonly Locale[],
): ResolvedValue {
  if (map) {
    const exact = nonEmpty(map[locale]);
    if (exact !== null) return { value: exact, isFallback: false, resolvedLocale: locale };

    for (const code of chain) {
      if (code === locale) continue;
      const v = nonEmpty(map[code]);
      if (v !== null) return { value: v, isFallback: true, resolvedLocale: code };
    }
    // Last resort: any populated locale, so the UI never renders blank.
    for (const code of Object.keys(map)) {
      const v = nonEmpty(map[code]);
      if (v !== null) return { value: v, isFallback: true, resolvedLocale: code };
    }
  }
  return { value: "", isFallback: true, resolvedLocale: null };
}

/** Convenience: just the resolved string. */
export function localizedValue(
  map: LocalizedMap | null | undefined,
  locale: Locale,
  chain: readonly Locale[],
): string {
  return resolveLocalized(map, locale, chain).value;
}

/** True when the map has a non-empty value for `locale` SPECIFICALLY (status dot). */
export function hasLocale(map: LocalizedMap | null | undefined, locale: Locale): boolean {
  return !!map && nonEmpty(map[locale]) !== null;
}

/** Locales in `supported` that are missing a value (translation gaps for one field). */
export function missingLocales(
  map: LocalizedMap | null | undefined,
  supported: readonly Locale[],
): Locale[] {
  return supported.filter((l) => !hasLocale(map, l));
}

/** Immutably set a locale's value in a map (writers / Translation Center). */
export function setLocalized(
  map: LocalizedMap | null | undefined,
  locale: Locale,
  value: string,
): LocalizedMap {
  const next: LocalizedMap = { ...(map ?? {}) };
  const trimmed = value.trim();
  if (trimmed.length === 0) delete next[locale];
  else next[locale] = trimmed;
  return next;
}
