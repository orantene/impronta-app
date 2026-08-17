import type { Metadata } from "next";

import {
  buildLocaleAlternates,
  type LocaleAlternates,
} from "@/i18n/alternates";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { getPublicHostContext, getPublicPathPrefix } from "@/lib/saas/scope";
import { publicAlternatesOrigin } from "@/lib/seo/site-origin";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";

export { publicSiteMetadataBase } from "@/lib/seo/site-origin";

/**
 * The locales the platform's own marketing tree is authored in.
 *
 * Deliberately a constant rather than a read of the global `app_locales`
 * registry: `fr` is enabled_public there but has zero translated marketing
 * content, and advertising an hreflang for a language with no page behind it is
 * worse than advertising nothing. TODO — derive this from a real per-locale
 * content check (or a "marketing translated" flag on `app_locales`) once a
 * third marketing language is actually translated; until then this list IS the
 * content check.
 */
const MARKETING_LOCALES = ["en", "es"] as const;

/**
 * metadataBase for the marketing surface: the SaaS apex (tulala.digital), not
 * the configured app-host origin. Used so the inherited `opengraph-image`
 * file-route and every relative URL resolve to the public marketing origin.
 */
export function marketingSiteMetadataBase(): URL {
  return new URL(`https://${PLATFORM_BRAND.domain}`);
}

/** Shape both metadata builders return: absolute canonical + hreflang links. */
function toMetadata(
  base: URL,
  alternates: LocaleAlternates,
): Pick<Metadata, "metadataBase" | "alternates"> {
  return {
    metadataBase: base,
    alternates: {
      canonical: alternates.canonical,
      // Solo-language pages carry no `languages` key at all, so Next emits no
      // `<link rel="alternate" hreflang>` for them.
      ...(alternates.languages ? { languages: alternates.languages } : {}),
    },
  };
}

/**
 * hreflang + self-referencing canonical for a marketing route, anchored to the
 * marketing apex (which genuinely owns those URLs).
 */
export function buildMarketingLocaleAlternates(
  locale: string,
  pathnameWithoutLocale: string,
): Pick<Metadata, "metadataBase" | "alternates"> {
  const base = marketingSiteMetadataBase();
  return toMetadata(
    base,
    buildLocaleAlternates({
      origin: base,
      pathnameWithoutLocale,
      currentLocale: locale,
      defaultLocale: "en",
      supportedLocales: MARKETING_LOCALES,
    }),
  );
}

/**
 * hreflang + canonical for a public TENANT page, resolved from the request.
 *
 * Two things this gets right that the previous fixed-origin helper did not:
 *
 *  1. **Origin.** A tenant on its own domain canonicalizes to that domain. The
 *     old helper anchored everything to `NEXT_PUBLIC_SITE_URL`, so every page
 *     of improntamodels.com declared itself a duplicate of a tulala.digital URL
 *     — two of which 404 (verified live, 2026-08-16).
 *  2. **Languages.** The alternate set comes from the tenant's own
 *     `supported_locales`, so a solo-language tenant emits no hreflang, and a
 *     tenant whose default is `es` gets Spanish unprefixed with English at
 *     `/en/…` and `x-default` on the Spanish URL.
 *
 * Returns `{}` when no origin can be trusted (see `publicAlternatesOrigin`);
 * callers then emit no canonical rather than a cross-domain one.
 *
 * `pathnameWithoutLocale` is the locale-free, prefix-free path (`/`, `/models`,
 * `/p/about`); the path-based tenant prefix is added here from the request.
 */
export async function buildTenantLocaleAlternates(
  locale: string,
  pathnameWithoutLocale: string,
  options: {
    /**
     * Locales this specific page really exists in, for per-locale-row content
     * (CMS pages / posts). Intersected with the tenant's supported set, so an
     * untranslated page never advertises an alternate that 404s. Omit for
     * framework-rendered routes, which exist in every supported locale.
     */
    availableLocales?: readonly string[];
  } = {},
): Promise<Pick<Metadata, "metadataBase" | "alternates">> {
  const hostContext = await getPublicHostContext();
  const origin = publicAlternatesOrigin(hostContext);
  if (!origin) return {};

  // Marketing has no tenant row; its locale pair is the authored-content list.
  if (!hostContext.tenantId) {
    return toMetadata(
      origin,
      buildLocaleAlternates({
        origin,
        pathnameWithoutLocale,
        currentLocale: locale,
        defaultLocale: "en",
        supportedLocales: MARKETING_LOCALES,
      }),
    );
  }

  const [localeSettings, pathPrefix] = await Promise.all([
    loadTenantLocaleSettings(hostContext.tenantId),
    getPublicPathPrefix(),
  ]);

  const available = options.availableLocales;
  const supportedLocales = available
    ? localeSettings.supportedLocales.filter((code) => available.includes(code))
    : localeSettings.supportedLocales;

  return toMetadata(
    origin,
    buildLocaleAlternates({
      origin,
      pathnameWithoutLocale,
      currentLocale: locale,
      defaultLocale: localeSettings.defaultLocale,
      supportedLocales,
      pathPrefix,
    }),
  );
}
