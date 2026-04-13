export const locales = ["en", "es"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export function isLocale(value: string | undefined | null): value is Locale {
  return value === "en" || value === "es";
}

export type LocaleMetadata = {
  dir: "ltr" | "rtl";
  hreflang: string;
  label: string;
};

export const localeMetadata: Record<Locale, LocaleMetadata> = {
  en: { dir: "ltr", hreflang: "en", label: "English" },
  es: { dir: "ltr", hreflang: "es", label: "Español" },
};

export function getLocaleMetadata(locale: Locale): LocaleMetadata {
  return localeMetadata[locale];
}
