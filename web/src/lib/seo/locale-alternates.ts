import type { Metadata } from "next";

import type { Locale } from "@/i18n/config";
import { withLocalePath } from "@/i18n/pathnames";

export function publicSiteMetadataBase(): URL {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";
  const normalized = raw.endsWith("/") ? raw.slice(0, -1) : raw;
  return new URL(normalized);
}

/**
 * hreflang + canonical for a public route: English unprefixed vs `/es…`.
 * `pathnameWithoutLocale` is the English path (e.g. `/directory`, `/`).
 */
export function buildPublicLocaleAlternates(
  locale: Locale,
  pathnameWithoutLocale: string,
): Pick<Metadata, "metadataBase" | "alternates"> {
  const pathEn = pathnameWithoutLocale.startsWith("/")
    ? pathnameWithoutLocale
    : `/${pathnameWithoutLocale}`;
  const pathEs = withLocalePath(pathEn, "es");
  return {
    metadataBase: publicSiteMetadataBase(),
    alternates: {
      canonical: locale === "es" ? pathEs : pathEn,
      languages: {
        en: pathEn,
        es: pathEs,
        "x-default": pathEn,
      },
    },
  };
}
