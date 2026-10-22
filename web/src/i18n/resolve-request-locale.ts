/**
 * Pure request-locale resolution (header / path / query / cookie).
 *
 * Path prefix (`/es/...`) wins. Then an explicit `?lang=` / `?locale=` (hub QA
 * and deep links). Then the middleware header, then the cookie, then default.
 *
 * Kept free of Next.js so unit tests can pin `?lang=es` on `/t/<code>` without
 * a request fixture.
 */

import { stripLocaleFromPathname, type LocaleUrlSettings } from "@/i18n/pathnames";

function isAllowed(
  code: string | null | undefined,
  publicLocales: readonly string[],
  def: string,
): code is string {
  if (!code) return false;
  return publicLocales.includes(code) || code === def;
}

/** First supported locale named by `?lang=` or `?locale=` in a query string. */
export function localeFromSearch(search: string | null | undefined): string | null {
  if (!search) return null;
  const raw = search.startsWith("?") ? search.slice(1) : search;
  if (!raw) return null;
  const q = new URLSearchParams(raw);
  const v = (q.get("lang") ?? q.get("locale") ?? "").trim().toLowerCase();
  return v || null;
}

export function resolveRequestLocale(input: {
  headerLocale: string | null | undefined;
  pathname: string | null | undefined;
  search: string | null | undefined;
  cookieLocale: string | null | undefined;
  publicLocales: readonly string[];
  defaultLocale: string;
  /**
   * TUL-1187 lets the cookie beat the path-derived header on an unprefixed path.
   * Marketing hosts pass `false` (TUL-1798): there `/` and `/pricing` ARE the
   * English URLs (Spanish lives under `/es`), so a leftover `es` cookie from an
   * earlier `/es` visit must not turn them Spanish.
   */
  cookieBeatsUnprefixedPath?: boolean;
}): string {
  const settings: LocaleUrlSettings = {
    defaultLocale: input.defaultLocale,
    publicLocales: input.publicLocales,
  };

  if (input.pathname) {
    const stripped = stripLocaleFromPathname(input.pathname, settings);
    if (
      stripped.hasLocalePrefix &&
      isAllowed(stripped.locale, input.publicLocales, input.defaultLocale)
    ) {
      return stripped.locale;
    }
  }

  const fromQuery = localeFromSearch(input.search);
  if (isAllowed(fromQuery, input.publicLocales, input.defaultLocale)) {
    return fromQuery;
  }

  // TUL-1187: an unprefixed path carries no locale signal; the middleware
  // header is just the path-derived default there, so an explicit choice (the
  // locale cookie) must beat it. With no pathname, keep header-first.
  const cookieOk = isAllowed(input.cookieLocale, input.publicLocales, input.defaultLocale);
  const headerOk = isAllowed(input.headerLocale, input.publicLocales, input.defaultLocale);
  if (input.pathname && cookieOk && input.cookieBeatsUnprefixedPath !== false) return input.cookieLocale as string;
  if (headerOk) return input.headerLocale as string;
  if (cookieOk) return input.cookieLocale as string;

  return input.defaultLocale;
}
