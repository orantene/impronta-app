import type { Metadata } from "next";

import { pathnameWithoutAnyLocalePrefix, withLocalePath } from "@/i18n/pathnames";

import { marketingSiteMetadataBase } from "./locale-alternates";

/**
 * Marketing routes whose SLUG IS SPANISH.
 *
 * These exist to rank for Spanish keywords ("agencia de talento", "contratar
 * modelos", "sitios web para restaurantes"). There is no English version of
 * them and there never will be: an English speaker looking for the same thing
 * lands on /agencies, /directory or /websites.
 *
 * THE BUG THIS FIXES (verified by rendering, 2026-08-21): locale is resolved
 * from the URL prefix, so `/agencia-de-talento` with no `/es` prefix resolved
 * to the DEFAULT locale and rendered in ENGLISH — title "A talent agency,
 * reimagined". Spanish only appeared at `/es/agencia-de-talento`. Meanwhile
 * `sitemap.ts` advertises BOTH forms for every marketing path, so the
 * English-at-a-Spanish-URL version was crawlable: a searcher clicking the
 * Spanish result could land on English copy.
 *
 * The fix pins these paths to `es` at the proxy, where the locale header is
 * set. That is deliberately NOT a page-level override: the surrounding chrome
 * (header, nav, footer) resolves its own locale from the same header, so
 * pinning only the page body would render Spanish content inside English
 * chrome.
 */
export const SPANISH_NAMED_MARKETING_PATHS: readonly string[] = [
  "/agencia-de-talento",
  "/contratar-modelos",
  "/sitios-web",
];

/**
 * Marketing SUBTREES whose slugs are Spanish.
 *
 * `SPANISH_NAMED_MARKETING_PATHS` above are single landings with no English
 * twin. This list is the other shape: a whole tree of Spanish-slugged pages
 * that DO have an English counterpart at a different slug, which is why the
 * feature hub needs `buildCrossSlugMarketingAlternates` rather than the
 * Spanish-only helper. `/funciones/citas-y-reservas` pairs with
 * `/features/appointments`, and each claims only its own URL.
 *
 * The locale pin is the same and for the same reason: without it the chrome
 * around a Spanish page renders in English.
 */
export const SPANISH_NAMED_MARKETING_PREFIXES: readonly string[] = ["/funciones", "/comparar"];

const SPANISH_NAMED_SET = new Set(SPANISH_NAMED_MARKETING_PATHS);

/**
 * True when `pathname` is a Spanish-named marketing route, with or without a
 * locale prefix. `/agencia-de-talento`, `/es/agencia-de-talento` and a
 * trailing slash all match; `/agencia-de-talento/algo` does not, because only
 * the landing pages themselves are Spanish-only.
 */
export function isSpanishNamedMarketingPath(pathname: string): boolean {
  const withoutLocale = pathnameWithoutAnyLocalePrefix(
    pathname.startsWith("/") ? pathname : `/${pathname}`,
  );
  const normalized =
    withoutLocale.length > 1 && withoutLocale.endsWith("/")
      ? withoutLocale.slice(0, -1)
      : withoutLocale;
  if (SPANISH_NAMED_SET.has(normalized)) return true;
  // Prefix match on a `/` boundary so `/funciones` and `/funciones/x` match
  // while `/funciones-falso` does not.
  return SPANISH_NAMED_MARKETING_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  );
}

/**
 * Canonical + hreflang for a Spanish-ONLY marketing route.
 *
 * Deliberately NOT `buildMarketingLocaleAlternates`: that helper emits an
 * `en` alternate pointing at the un-prefixed path. Once these routes render
 * Spanish at BOTH URLs, an `en` alternate would be a false claim — it would
 * promise search engines an English document at a URL that serves Spanish.
 *
 * So: one canonical (`/es/…`), `es` as the only language, and `x-default`
 * pointing at the same Spanish document rather than at a non-existent
 * English one.
 */
export function buildSpanishOnlyMarketingAlternates(
  pathnameWithoutLocale: string,
): Pick<Metadata, "metadataBase" | "alternates"> {
  const path = pathnameWithoutLocale.startsWith("/")
    ? pathnameWithoutLocale
    : `/${pathnameWithoutLocale}`;
  const pathEs = withLocalePath(path, "es");
  return {
    metadataBase: marketingSiteMetadataBase(),
    alternates: {
      canonical: pathEs,
      languages: {
        es: pathEs,
        "x-default": pathEs,
      },
    },
  };
}

/**
 * The locale to force for a marketing request, or `null` to resolve normally.
 *
 * Lives here rather than inline in `proxy.ts` for two reasons: that file sits
 * against an 800-line `max-lines` cap, and this is a pure decision that is
 * worth unit-testing on its own.
 */
export function pinnedMarketingLocale(
  hostKind: string,
  pathname: string,
): "es" | null {
  return hostKind === "marketing" && isSpanishNamedMarketingPath(pathname) ? "es" : null;
}

/**
 * Canonical + hreflang for a page that exists in BOTH languages at DIFFERENT
 * slugs.
 *
 * The feature hub is the first of these: `/features/appointments` and
 * `/funciones/citas-y-reservas` are the same page in two languages, and the
 * Spanish slug carries the search term, which is the entire point of having
 * one. `buildMarketingLocaleAlternates` cannot express this because it assumes
 * both locales share a path.
 *
 * Each locale claims ONLY its own URL as canonical, and `x-default` points at
 * English because an English version genuinely exists (unlike the Spanish-only
 * landings above, where x-default is Spanish because nothing else exists).
 * Getting this wrong is how a page declares itself a duplicate of another
 * locale, which is the failure that produced a canonical incident in August.
 */
export function buildCrossSlugMarketingAlternates(
  currentLocale: string,
  pair: { enPath: string; esPath: string },
): Pick<Metadata, "metadataBase" | "alternates"> {
  const en = pair.enPath;
  const es = withLocalePath(pair.esPath, "es");
  return {
    metadataBase: marketingSiteMetadataBase(),
    alternates: {
      canonical: currentLocale === "es" ? es : en,
      languages: { en, es, "x-default": en },
    },
  };
}
