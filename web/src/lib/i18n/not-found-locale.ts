/**
 * TUL-877 / TUL-1079: the language of a 404 page.
 *
 * A mistyped `/w/<unknown-slug>` has no locale prefix, no cookie and no tenant
 * to read a language from, so the request locale falls to the platform default
 * (English) and a Spanish visitor got an English dead end. Nobody chose English
 * there, so the browser's own language decides, unless the URL or the language
 * cookie said so explicitly. Pure so it is tested without a request.
 */
export function notFoundLocale(input: {
  /** The locale the request already resolved to. */
  locale: string;
  acceptLanguage: string | null | undefined;
  /** The visitor's language cookie, if any. */
  cookieLocale: string | null | undefined;
  /** Browser pathname, e.g. `/en/w/acme` or `/w/acme`. */
  pathname: string | null | undefined;
  /** Browser query string, with or without the `?`. */
  search: string | null | undefined;
}): string {
  if (!input.locale.toLowerCase().startsWith("en")) return input.locale;
  if (input.cookieLocale?.trim()) return input.locale;
  if (/^\/en(\/|$)/i.test(input.pathname ?? "")) return input.locale;
  if (/(?:^|[?&])(?:lang|locale)=/i.test(input.search ?? "")) return input.locale;
  const first = (input.acceptLanguage ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  return first.startsWith("es") ? "es" : input.locale;
}
