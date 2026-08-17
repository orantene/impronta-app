import { defaultLocale, isLocaleInList, type Locale } from "@/i18n/config";
import {
  stripLocaleFromPathname,
  withLocalePath,
  type LocaleUrlSettings,
} from "@/i18n/pathnames";
import { prefixPublicHref } from "@/lib/saas/public-hrefs";
import { resolveAnyTenantPublicPath } from "@/lib/saas/surface-allow-list";

const EXTERNAL_OR_SPECIAL_HREF = /^(?:[a-z][a-z0-9+.-]*:|#|\?)/i;

/**
 * `settings` carries the TENANT's URL grammar (default locale unprefixed, every
 * other supported locale under `/{code}`). Omitting it falls back to the global
 * platform grammar, which is only correct off-tenant — on a tenant whose default
 * locale is not the platform default it produces the inverse prefixing. Server
 * components get it from `getRequestLocaleUrlSettings()`; client components must
 * receive it as a prop (see `localeUrlSettings()` in `@/i18n/pathnames`).
 */
export function publicPathPrefixFromPathname(
  pathname: string,
  settings?: LocaleUrlSettings,
): string {
  const visiblePathname =
    typeof window === "undefined" ? pathname : window.location.pathname;
  const { pathnameWithoutLocale } = stripLocaleFromPathname(
    visiblePathname,
    settings,
  );
  const resolved = resolveAnyTenantPublicPath(pathnameWithoutLocale);
  return resolved ? `/${resolved.tenantSlug}` : "";
}

export function publicLocaleHref(
  currentPathname: string,
  pathFromRoot: string,
  locale: Locale,
  settings?: LocaleUrlSettings,
): string {
  if (EXTERNAL_OR_SPECIAL_HREF.test(pathFromRoot)) {
    return pathFromRoot;
  }
  const prefix = publicPathPrefixFromPathname(currentPathname, settings);
  const p = pathFromRoot.startsWith("/") ? pathFromRoot : `/${pathFromRoot}`;
  const prefixed = prefixPublicHref(p, prefix);
  return withLocalePath(prefixed, locale, settings);
}

/**
 * Prefix `pathFromRoot` (e.g. `/directory`, `/directory/cart?q=1`) with the
 * current non-default locale so client navigations stay in-locale.
 */
export function clientLocaleHref(
  pathname: string,
  pathFromRoot: string,
  settings?: LocaleUrlSettings,
): string {
  const { locale: raw } = stripLocaleFromPathname(pathname, settings);
  // Validate against the ACTIVE locale set, not a hardcoded en/es union: a
  // tenant publishing e.g. `["es","pt"]` would otherwise have every client
  // navigation snapped back to the platform default.
  const allowed = settings?.publicLocales;
  const locale: Locale = allowed
    ? isLocaleInList(raw, allowed)
      ? raw
      : settings.defaultLocale
    : isLocaleInList(raw, ["en", "es"])
      ? raw
      : defaultLocale;
  return publicLocaleHref(pathname, pathFromRoot, locale, settings);
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
  settings?: LocaleUrlSettings,
): string {
  const q = queryString.startsWith("?") ? queryString.slice(1) : queryString;

  let resolvedBase: string;
  if (basePath) {
    resolvedBase = basePath;
  } else {
    const { pathnameWithoutLocale } = stripLocaleFromPathname(pathname, settings);
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
    stripLocaleFromPathname(baseNoQuery, settings);
  const cleanBase = baseStripped.startsWith("/")
    ? baseStripped
    : `/${baseStripped}`;
  const path = q ? `${cleanBase}?${q}` : cleanBase;
  return clientLocaleHref(pathname, path, settings);
}
