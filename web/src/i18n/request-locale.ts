import { cookies, headers } from "next/headers";
import type { Locale } from "@/i18n/config";
import { defaultLocale } from "@/i18n/config";
import { LOCALE_COOKIE } from "@/i18n/locale-middleware";
import { stripLocaleFromPathname } from "@/i18n/pathnames";
import { getLanguageSettingsPublicCached } from "@/lib/language-settings/get-language-settings";

const LOCALE_HEADER = "x-impronta-locale";

/** Browser pathname (e.g. `/es/directory`) — set in middleware before rewrite so locale does not depend on stale cookies in the same request. */
export const ORIGINAL_PATHNAME_HEADER = "x-impronta-original-pathname";

/**
 * Browser query string INCLUDING the leading `?` (e.g. `?tax=…&q=…`), set in
 * middleware alongside the pathname.
 *
 * Next only hands `searchParams` to page components. Sections rendered deep
 * inside the CMS renderer (page → HomepageCmsSections → registry → Component)
 * have no other way to see the live filters, so a server-rendered listing
 * could not match the URL it was requested with. Read it with
 * `getRequestSearchParams()`.
 */
export const ORIGINAL_SEARCH_HEADER = "x-impronta-original-search";

/**
 * URLSearchParams for the CURRENT request, usable from any server component.
 * Empty when the header is absent (e.g. a route that bypasses middleware) —
 * callers must treat that as "no filters", never as an error.
 */
export async function getRequestSearchParams(): Promise<URLSearchParams> {
  const h = await headers();
  const raw = h.get(ORIGINAL_SEARCH_HEADER) ?? "";
  return new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
}

function isAllowedPublicLocale(code: string | null | undefined, publicLocales: string[], def: string): code is string {
  if (!code) return false;
  return publicLocales.includes(code) || code === def;
}

/**
 * Resolved locale for server rendering: middleware header, URL pathname header (rewrite-safe),
 * then cookie, then default from language settings.
 */
export async function getRequestLocale(): Promise<Locale> {
  const settings = await getLanguageSettingsPublicCached();
  const h = await headers();
  const fromHeader = h.get(LOCALE_HEADER);
  if (isAllowedPublicLocale(fromHeader, settings.publicLocales, settings.defaultLocale)) {
    return fromHeader;
  }

  const originalPath = h.get(ORIGINAL_PATHNAME_HEADER);
  if (originalPath) {
    const { locale } = stripLocaleFromPathname(originalPath, settings);
    return locale;
  }

  const jar = await cookies();
  const fromCookie = jar.get(LOCALE_COOKIE)?.value;
  if (isAllowedPublicLocale(fromCookie, settings.publicLocales, settings.defaultLocale)) {
    return fromCookie;
  }

  return settings.defaultLocale ?? defaultLocale;
}

export { LOCALE_HEADER };
