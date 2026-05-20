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
 *
 * `basePath` lets the portable Directory section keep filter/sort/pill
 * navigations on the **current** page (e.g. `/p/our-fashion-models?...`)
 * instead of bouncing visitors back to the seeded `/directory` route.
 *
 * Auto-detection (when `basePath` is NOT supplied), based on the
 * locale-stripped `pathname`:
 *
 *   - starts with `/directory`  → use `/directory`  (legacy seeded page)
 *   - is `/` or empty           → use `/directory`  (homepage HeroSearch)
 *   - anything else             → use `pathname`    (portable section
 *                                                    on a builder page)
 *
 * This preserves byte-identical behavior on every pre-existing caller
 * (HeroSearch on `/`, every legacy directory control on `/directory`,
 * the URL-sync inside `commitDirectoryListingUrl`) while making the
 * helper portability-correct for the new section without forcing edits
 * to ~6 legacy consumers that already pass the current `pathname` in.
 * Explicit `basePath` always wins.
 *
 * The supplied `basePath` is treated as a path-from-root: any leading
 * locale prefix is stripped before re-applying the current locale via
 * `clientLocaleHref`, and any existing query/hash on it is dropped (we
 * only carry the supplied `queryString`).
 */
export function clientDirectoryHref(
  pathname: string,
  queryString: string,
  basePath?: string,
): string {
  const q = queryString.startsWith("?") ? queryString.slice(1) : queryString;

  let resolvedBase: string;
  if (basePath) {
    resolvedBase = basePath;
  } else {
    const { pathnameWithoutLocale } = stripLocaleFromPathname(pathname);
    if (
      pathnameWithoutLocale === "/directory" ||
      pathnameWithoutLocale.startsWith("/directory/") ||
      pathnameWithoutLocale === "" ||
      pathnameWithoutLocale === "/"
    ) {
      resolvedBase = "/directory";
    } else {
      resolvedBase = pathnameWithoutLocale;
    }
  }

  // Strip locale prefix + any incidental query/hash from the supplied base
  // so we can re-apply the current locale + our canonical query cleanly.
  const baseNoQuery = resolvedBase.split(/[?#]/)[0] || "/directory";
  const { pathnameWithoutLocale: baseStripped } =
    stripLocaleFromPathname(baseNoQuery);
  const cleanBase = baseStripped.startsWith("/")
    ? baseStripped
    : `/${baseStripped}`;
  const path = q ? `${cleanBase}?${q}` : cleanBase;
  return clientLocaleHref(pathname, path);
}
