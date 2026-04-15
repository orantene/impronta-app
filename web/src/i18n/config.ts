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

/** Narrow check against static en/es only — use `isLocaleInSettings` for dynamic validation. */
export function isLocale(value: string | undefined | null): value is StaticLocale {
  return value === "en" || value === "es";
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

/** Labels for static en/es; unknown locales get code as label until DB metadata is wired. */
export const localeMetadata: Record<string, LocaleMetadata> = {
  en: { dir: "ltr", hreflang: "en", label: "English" },
  es: { dir: "ltr", hreflang: "es", label: "Español" },
};

export function getLocaleMetadata(locale: string): LocaleMetadata {
  return localeMetadata[locale] ?? {
    dir: "ltr",
    hreflang: locale.split("-")[0] ?? locale,
    label: locale,
  };
}
