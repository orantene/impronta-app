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

  if (isAllowed(input.headerLocale, input.publicLocales, input.defaultLocale)) {
    return input.headerLocale;
  }

  if (isAllowed(input.cookieLocale, input.publicLocales, input.defaultLocale)) {
    return input.cookieLocale;
  }

  return input.defaultLocale;
}
