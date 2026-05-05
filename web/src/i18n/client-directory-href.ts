import { defaultLocale, isLocale, type Locale } from "@/i18n/config";
import { stripLocaleFromPathname, withLocalePath } from "@/i18n/pathnames";
import { prefixPublicHref } from "@/lib/saas/public-hrefs";
import { resolvePathBasedTenantPublicPath } from "@/lib/saas/surface-allow-list";

const EXTERNAL_OR_SPECIAL_HREF = /^(?:[a-z][a-z0-9+.-]*:|#|\?)/i;

export function publicPathPrefixFromPathname(pathname: string): string {
  const visiblePathname =
    typeof window === "undefined" ? pathname : window.location.pathname;
  const { pathnameWithoutLocale } = stripLocaleFromPathname(visiblePathname);
  const resolved = resolvePathBasedTenantPublicPath(pathnameWithoutLocale);
  return resolved ? `/${resolved.tenantSlug}` : "";
}

export function publicLocaleHref(
  currentPathname: string,
  pathFromRoot: string,
  locale: Locale,
): string {
  if (EXTERNAL_OR_SPECIAL_HREF.test(pathFromRoot)) {
    return pathFromRoot;
  }
  const prefix = publicPathPrefixFromPathname(currentPathname);
  const p = pathFromRoot.startsWith("/") ? pathFromRoot : `/${pathFromRoot}`;
  const prefixed = prefixPublicHref(p, prefix);
  return withLocalePath(prefixed, locale);
}

/**
 * Prefix `pathFromRoot` (e.g. `/directory`, `/directory/cart?q=1`) with `/es` when the
 * current route is Spanish, so client navigations stay in-locale.
 */
export function clientLocaleHref(pathname: string, pathFromRoot: string): string {
  const { locale: raw } = stripLocaleFromPathname(pathname);
  const locale: Locale = isLocale(raw) ? raw : defaultLocale;
  return publicLocaleHref(pathname, pathFromRoot, locale);
}

/**
 * Directory listing URL with optional query string (with or without leading `?`).
 */
export function clientDirectoryHref(pathname: string, queryString: string): string {
  const q = queryString.startsWith("?") ? queryString.slice(1) : queryString;
  const path = q ? `/directory?${q}` : "/directory";
  return clientLocaleHref(pathname, path);
}
