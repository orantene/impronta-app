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
import type { Locale } from "@/lib/site-admin/locales";

/** Read the app's `locale` cookie client-side. "en" on the server / no cookie. */
export function readLocale(): string {
  if (typeof document === "undefined") return "en";
  const m = document.cookie.match(/(?:^|;\s*)locale=([^;]+)/);
  return m?.[1] === "es" ? "es" : "en";
}

/**
 * Single-locale fallback chain `[locale, "en"]` for the common client case
 * where only the active `locale` cookie is known and no tenant settings are in
 * scope (e.g. the `readLocale()`-driven shell editors). Server/render paths
 * that have `TenantLocaleSettings` should pass `settings.fallbackChain(locale)`.
 */
function defaultChain(locale: Locale): Locale[] {
  return locale === "en" ? ["en"] : [locale, "en"];
}

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
