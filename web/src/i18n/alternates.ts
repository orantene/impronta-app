/**
 * Per-tenant `hreflang` + canonical URL construction.
 *
 * ONE pure function builds every alternate link the app emits, so page
 * metadata (`<link rel="alternate" hreflang=…>`) and the sitemap
 * (`<xhtml:link rel="alternate" …>`) can never drift apart.
 *
 * Two rules this module exists to enforce:
 *
 *  1. **The origin comes from the caller, never from an env var.** A tenant
 *     custom domain must declare itself canonical. Anchoring alternates to a
 *     fixed platform origin told Google that every page of a tenant's site was
 *     a duplicate of a URL on someone else's domain (live bug, 2026-08-16).
 *
 *  2. **A single-language site emits NO `hreflang` at all.** hreflang is a
 *     relationship between translations; with one language there is no
 *     relationship to declare, and a lone self-referencing annotation is noise
 *     Google ignores at best. Most tenants are solo-language, so this is the
 *     common case, not the edge case.
 *
 * URL grammar is delegated to `withLocalePath`, so when a tenant flips its
 * default locale (e.g. Impronta `en` → `es`) the unprefixed URL follows the new
 * default automatically and nothing here needs editing.
 */

import type { LanguageSettings } from "@/lib/language-settings/types";
import { FALLBACK_LANGUAGE_SETTINGS } from "@/lib/language-settings/fetch-language-settings";
import { withLocalePath } from "@/i18n/pathnames";

/** hreflang value → absolute URL. Keys are locale codes plus `x-default`. */
export type HreflangMap = Record<string, string>;

export type LocaleAlternates = {
  /** Absolute URL of this page in the locale being rendered. */
  canonical: string;
  /**
   * Absent for solo-language pages — see rule 2 above. Present only when the
   * page genuinely exists in two or more languages.
   */
  languages?: HreflangMap;
};

export type LocaleAlternatesInput = {
  /**
   * Absolute origin of the host actually serving the request
   * (e.g. `https://improntamodels.com`). Callers that cannot resolve a host
   * must not guess one — they should emit no alternates instead.
   */
  origin: string | URL;
  /** Locale-free path: `/`, `/models`, `/p/about`, `/t/abc123`. */
  pathnameWithoutLocale: string;
  /** Locale this page is rendered in. Decides which URL is the canonical. */
  currentLocale: string;
  /**
   * The site's default locale. Served unprefixed, and the `x-default` target.
   * For a tenant this is `agency_business_identity.default_locale`.
   */
  defaultLocale: string;
  /**
   * Every locale this page actually exists in, including the default. Pass the
   * tenant's `supported_locales` for framework-rendered routes, or the set of
   * locales that really have a row for CMS content. Locales the tenant does not
   * support must never appear here — a globally enabled but unsupported locale
   * (today: `fr`) would otherwise be advertised with no content behind it.
   */
  supportedLocales: readonly string[];
  /**
   * Path-based tenant prefix (`/impronta`) for storefronts served from a shared
   * host rather than their own domain. The locale segment comes FIRST in this
   * app's grammar (`/es/impronta/models`), which is what prefixing before
   * `withLocalePath` produces.
   */
  pathPrefix?: string;
};

/**
 * A `LanguageSettings` shim carrying only what `withLocalePath` reads
 * (`defaultLocale` + `publicLocales`). Building it here keeps the URL grammar
 * in one place instead of re-deriving "default is unprefixed" per call site.
 */
function pathGrammar(
  defaultLocale: string,
  supportedLocales: readonly string[],
): LanguageSettings {
  return {
    ...FALLBACK_LANGUAGE_SETTINGS,
    defaultLocale,
    publicLocales: [...new Set([defaultLocale, ...supportedLocales])],
  };
}

/** `/impronta` + `/models` → `/impronta/models`; `/impronta` + `/` → `/impronta`. */
function joinPath(pathPrefix: string, pathname: string): string {
  const prefix = pathPrefix.endsWith("/") ? pathPrefix.slice(0, -1) : pathPrefix;
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (!prefix) return path;
  return path === "/" ? prefix : `${prefix}${path}`;
}

/**
 * Absolute URL for one locale of one page.
 *
 * `new URL(path, origin)` is what keeps `/` from becoming `//` and collapses any
 * accidental double slash, so no string concatenation happens anywhere here.
 */
export function localeAlternateUrl(
  input: Omit<LocaleAlternatesInput, "currentLocale" | "origin"> & {
    origin: string | URL;
  },
  locale: string,
): string {
  const settings = pathGrammar(input.defaultLocale, input.supportedLocales);
  const path = joinPath(input.pathPrefix ?? "", input.pathnameWithoutLocale);
  return new URL(withLocalePath(path, locale, settings), input.origin).toString();
}

/**
 * Canonical + hreflang set for one page in one locale.
 *
 * Solo-language input returns `{ canonical }` with no `languages` key at all.
 */
export function buildLocaleAlternates(
  input: LocaleAlternatesInput,
): LocaleAlternates {
  // De-duplicate while keeping the default first, so the emitted order is
  // stable across renders (diff-friendly HTML, stable sitemap bytes).
  const locales = [...new Set([input.defaultLocale, ...input.supportedLocales])]
    .filter((code) => input.supportedLocales.includes(code));

  const urlFor = (locale: string) => localeAlternateUrl(input, locale);

  // A page served in a locale the site does not support is a fallback render:
  // point its canonical at the default so signals consolidate there rather than
  // on a URL that only ever shows fallback content.
  const canonicalLocale = locales.includes(input.currentLocale)
    ? input.currentLocale
    : input.defaultLocale;
  const canonical = urlFor(canonicalLocale);

  if (locales.length < 2) {
    return { canonical };
  }

  const languages: HreflangMap = {};
  for (const locale of locales) {
    languages[locale] = urlFor(locale);
  }
  // `x-default` is the "no language matched" landing target, so it belongs on
  // the site's own default. Omitted when the default locale has no version of
  // this page (a CMS page translated into secondaries but not the default) —
  // pointing x-default at a URL with no content is worse than omitting it.
  if (locales.includes(input.defaultLocale)) {
    languages["x-default"] = urlFor(input.defaultLocale);
  }

  return { canonical, languages };
}
