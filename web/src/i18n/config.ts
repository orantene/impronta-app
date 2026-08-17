/**
 * Compile-time fallbacks when `app_locales` is unavailable (offline DB, tests).
 * Runtime lists come from `getLanguageSettings` / `fetchLanguageSettingsPublic`.
 */
export const STATIC_LOCALES = ["en", "es"] as const;

/** @deprecated Prefer validating against `LanguageSettings.publicLocales` / `adminLocales`. */
export type StaticLocale = (typeof STATIC_LOCALES)[number];

/** BCP-47 locale code (dynamic catalog). */
export type Locale = string;

/** Fallback when DB is unreachable; must match seeded `app_locales.is_default`. */
export const defaultLocale: Locale = "en";

/** Shape of a BCP-47 / ISO locale code ("en", "fr", "pt-BR"). */
const LOCALE_CODE_RE = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})?$/;

/**
 * Runtime guard: the value LOOKS like a locale code.
 *
 * This used to be `value === "en" || value === "es"`. That hardcoded pair is a
 * membership test, and membership does not live here — it lives in the
 * `app_locales` registry (platform) and in
 * `agency_business_identity.supported_locales` (per tenant). Callers that need
 * membership must use `isLocaleInList(value, settings.publicLocales)`; callers
 * that only need "is this a locale code at all" use this. Matches the behaviour
 * of `isLocale` in `@/lib/site-admin/locales`, which the rest of the platform
 * already standardised on.
 */
export function isLocale(value: string | undefined | null): value is Locale {
  return typeof value === "string" && LOCALE_CODE_RE.test(value.trim());
}

export function isLocaleInList(value: string | undefined | null, allowed: readonly string[]): value is string {
  if (!value) return false;
  return allowed.includes(value);
}

export type LocaleMetadata = {
  dir: "ltr" | "rtl";
  hreflang: string;
  label: string;
};

/**
 * Native labels + hreflang for common locales. Registry-added languages resolve
 * here so the public switcher's aria-label and `getLocaleMetadata` show a proper
 * native name (e.g. `fr` → "Français") instead of the bare code. Locales not
 * listed still fall back to the code via `getLocaleMetadata`.
 */
export const localeMetadata: Record<string, LocaleMetadata> = {
  en: { dir: "ltr", hreflang: "en", label: "English" },
  es: { dir: "ltr", hreflang: "es", label: "Español" },
  fr: { dir: "ltr", hreflang: "fr", label: "Français" },
  pt: { dir: "ltr", hreflang: "pt", label: "Português" },
  "pt-BR": { dir: "ltr", hreflang: "pt-BR", label: "Português (Brasil)" },
  de: { dir: "ltr", hreflang: "de", label: "Deutsch" },
  it: { dir: "ltr", hreflang: "it", label: "Italiano" },
  ja: { dir: "ltr", hreflang: "ja", label: "日本語" },
};

export function getLocaleMetadata(locale: string): LocaleMetadata {
  return localeMetadata[locale] ?? {
    dir: "ltr",
    hreflang: locale.split("-")[0] ?? locale,
    label: locale,
  };
}
