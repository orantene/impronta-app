import type { Metadata } from "next";

import type { Locale } from "@/i18n/config";
import { withLocalePath } from "@/i18n/pathnames";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { PLATFORM_BRAND } from "@/lib/platform/brand";

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
      canonical: pickLocale(locale, { en: pathEn, es: pathEs }),
      languages: {
        en: pathEn,
        es: pathEs,
        "x-default": pathEn,
      },
    },
  };
}

/**
 * metadataBase for the marketing surface: the SaaS apex (tulala.digital),
 * NOT NEXT_PUBLIC_SITE_URL (which is the app host, app.tulala.digital). Used
 * so the inherited `opengraph-image` file-route and every relative canonical
 * resolve to the public marketing origin.
 */
export function marketingSiteMetadataBase(): URL {
  return new URL(`https://${PLATFORM_BRAND.domain}`);
}

/**
 * hreflang + self-referencing canonical for a marketing route, based on the
 * marketing apex. Mirrors `buildPublicLocaleAlternates` (EN unprefixed vs
 * `/es…`) but pins `metadataBase` to tulala.digital.
 */
export function buildMarketingLocaleAlternates(
  locale: Locale,
  pathnameWithoutLocale: string,
): Pick<Metadata, "metadataBase" | "alternates"> {
  const pathEn = pathnameWithoutLocale.startsWith("/")
    ? pathnameWithoutLocale
    : `/${pathnameWithoutLocale}`;
  const pathEs = withLocalePath(pathEn, "es");
  return {
    metadataBase: marketingSiteMetadataBase(),
    alternates: {
      canonical: pickLocale(locale, { en: pathEn, es: pathEs }),
      languages: {
        en: pathEn,
        es: pathEs,
        "x-default": pathEn,
      },
    },
  };
}
