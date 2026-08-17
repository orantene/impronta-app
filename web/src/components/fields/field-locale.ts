// Locale helpers for the shared <FieldEditor> and its callers. Extracted from
// FieldEditor.tsx (which hit the 800-line cap) — pure functions, no React.
//
// Multi-language (WS3): field labels/helpers/option-labels are stored as
// per-locale JSONB maps (`label_i18n`, `helper_i18n`, `option_labels_i18n`).
// Every helper here is a thin wrapper over the universal resolver
// (`resolveLocalized`) — NEVER a `locale === "es" ? … : …` branch. Callers pass
// the active locale + the tenant fallback chain
// (`TenantLocaleSettings.fallbackChain(locale)`); the resolver walks the chain
// so an untranslated field still renders.

import {
  resolveLocalized,
  type LocalizedMap,
} from "@/lib/i18n/resolve-localized";
import {
  DEFAULT_PLATFORM_LOCALE,
  isLocale,
  type Locale,
} from "@/lib/site-admin/locales";

/**
 * Read the app's `locale` cookie client-side.
 *
 * Previously this collapsed every cookie value to the en/es pair
 * (`m?.[1] === "es" ? "es" : "en"`), so a tenant publishing any other language
 * had EVERY client-side field label resolve as English regardless of what the
 * visitor had actually selected. Now any well-formed BCP-47 code round-trips;
 * membership is validated by the resolver's fallback chain, not here.
 *
 * `fallback` is the platform default only because a bare client editor has no
 * tenant in scope. Callers that DO know the tenant should pass its
 * `defaultLocale` so a no-cookie load lands on the tenant's own language.
 */
export function readLocale(fallback: Locale = DEFAULT_PLATFORM_LOCALE): string {
  if (typeof document === "undefined") return fallback;
  const m = document.cookie.match(/(?:^|;\s*)locale=([^;]+)/);
  const raw = m?.[1] ? decodeURIComponent(m[1]).trim() : "";
  return isLocale(raw) ? raw : fallback;
}

/**
 * Fallback chain for the common client case where only the active `locale`
 * cookie is known and no tenant settings are in scope (e.g. the
 * `readLocale()`-driven shell editors).
 *
 * The terminal locale is a PARAMETER, not a hardcoded `"en"`. The old
 * `locale === "en" ? ["en"] : [locale, "en"]` always ended the walk at English,
 * so on a tenant whose default locale is (say) `es` an untranslated field fell
 * back to a language the tenant does not publish instead of to the tenant's own
 * default. Render paths holding `TenantLocaleSettings` should still pass
 * `settings.fallbackChain(locale)` — it is the authoritative walk.
 */
export function clientFallbackChain(
  locale: Locale,
  fallbackLocale: Locale = DEFAULT_PLATFORM_LOCALE,
): Locale[] {
  return locale === fallbackLocale ? [locale] : [locale, fallbackLocale];
}

const defaultChain = clientFallbackChain;

/** Locale-aware field label — resolves `label_i18n` against the fallback chain. */
export function fieldLabel(
  field: { label_i18n?: LocalizedMap | null },
  locale: Locale,
  chain: readonly Locale[] = defaultChain(locale),
): string {
  return resolveLocalized(field.label_i18n ?? null, locale, chain).value;
}

/** Locale-aware helper text — resolves `helper_i18n`; null when empty. */
export function fieldHelper(
  field: { helper_i18n?: LocalizedMap | null },
  locale: Locale,
  chain: readonly Locale[] = defaultChain(locale),
): string | null {
  const v = resolveLocalized(field.helper_i18n ?? null, locale, chain).value;
  return v.length > 0 ? v : null;
}

/** Locale-aware placeholder — resolves `placeholder_i18n`; "" when empty. */
export function fieldPlaceholder(
  field: { placeholder_i18n?: LocalizedMap | null },
  locale: Locale,
  chain: readonly Locale[] = defaultChain(locale),
): string {
  return resolveLocalized(field.placeholder_i18n ?? null, locale, chain).value;
}

/** Locale-aware option label — resolves `option_labels_i18n[value]`, falling
 *  back to the option value (its English label) when there is no entry. */
export function optionLabel(
  field: { option_labels_i18n?: Record<string, LocalizedMap> | null },
  value: string,
  locale: Locale,
  chain: readonly Locale[] = defaultChain(locale),
): string {
  const map = field.option_labels_i18n?.[value] ?? null;
  const v = resolveLocalized(map, locale, chain).value;
  return v.length > 0 ? v : value;
}
