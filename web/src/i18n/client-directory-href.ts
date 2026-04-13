import { defaultLocale, isLocale, type Locale } from "@/i18n/config";
import { stripLocaleFromPathname, withLocalePath } from "@/i18n/pathnames";

/**
 * Prefix `pathFromRoot` (e.g. `/directory`, `/directory/cart?q=1`) with `/es` when the
 * current route is Spanish, so client navigations stay in-locale.
 */
export function clientLocaleHref(pathname: string, pathFromRoot: string): string {
  const { locale: raw } = stripLocaleFromPathname(pathname);
  const locale: Locale = isLocale(raw) ? raw : defaultLocale;
  const p = pathFromRoot.startsWith("/") ? pathFromRoot : `/${pathFromRoot}`;
  return withLocalePath(p, locale);
}

/**
 * Directory listing URL with optional query string (with or without leading `?`).
 */
export function clientDirectoryHref(pathname: string, queryString: string): string {
  const q = queryString.startsWith("?") ? queryString.slice(1) : queryString;
  const path = q ? `/directory?${q}` : "/directory";
  return clientLocaleHref(pathname, path);
}
