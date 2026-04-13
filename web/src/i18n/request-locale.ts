import { cookies, headers } from "next/headers";
import { defaultLocale, isLocale, type Locale } from "@/i18n/config";
import { LOCALE_COOKIE } from "@/i18n/locale-middleware";
import { stripLocaleFromPathname } from "@/i18n/pathnames";

const LOCALE_HEADER = "x-impronta-locale";

/** Browser pathname (e.g. `/es/directory`) — set in middleware before rewrite so locale does not depend on stale cookies in the same request. */
export const ORIGINAL_PATHNAME_HEADER = "x-impronta-original-pathname";

/**
 * Resolved locale for server rendering: middleware header, URL pathname header (rewrite-safe),
 * then cookie, then default.
 */
export async function getRequestLocale(): Promise<Locale> {
  const h = await headers();
  const fromHeader = h.get(LOCALE_HEADER);
  if (isLocale(fromHeader)) return fromHeader;

  const originalPath = h.get(ORIGINAL_PATHNAME_HEADER);
  if (originalPath) {
    const { locale } = stripLocaleFromPathname(originalPath);
    return locale;
  }

  const jar = await cookies();
  const fromCookie = jar.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;

  return defaultLocale;
}

export { LOCALE_HEADER };
