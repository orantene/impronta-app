import { FALLBACK_LANGUAGE_SETTINGS } from "@/lib/language-settings/fetch-language-settings";

/**
 * The ONLY two fields URL grammar depends on.
 *
 * Every function in this module used to take the full global `LanguageSettings`
 * with `FALLBACK_LANGUAGE_SETTINGS` as a default argument. That default encodes
 * the PLATFORM grammar (`defaultLocale: "en"`, `publicLocales: ["en","es"]`),
 * which is simply wrong on a tenant whose default locale is not `en`: a tenant
 * with `default_locale = "es"` serves Spanish UNPREFIXED (`/models`) and English
 * at `/en/models`, the exact inverse of the fallback.
 *
 * Narrowing the parameter to this structural pair means a caller can pass a
 * tenant's `{ defaultLocale, supportedLocales }` (via `localeUrlSettings()`)
 * without importing the server-only tenant resolver into client code.
 * `LanguageSettings` remains structurally assignable, so every existing caller
 * keeps compiling unchanged.
 */
export type LocaleUrlSettings = {
  defaultLocale: string;
  publicLocales: readonly string[];
};

/**
 * Build URL-grammar settings from a tenant's locale pair.
 *
 * Client-safe on purpose: takes plain values, not the server-only
 * `TenantLocaleSettings` object, so a server component can pass
 * `{defaultLocale, supportedLocales}` down to a client component as props and
 * the client can rebuild the grammar without touching the DB.
 */
export function localeUrlSettings(
  defaultLocale: string | null | undefined,
  supportedLocales: readonly string[] | null | undefined,
): LocaleUrlSettings {
  const def = defaultLocale?.trim() || FALLBACK_LANGUAGE_SETTINGS.defaultLocale;
  const supported = (supportedLocales ?? []).filter(
    (l): l is string => typeof l === "string" && l.trim().length > 0,
  );
  return {
    defaultLocale: def,
    publicLocales: supported.length > 0 ? supported : [def],
  };
}

/**
 * Removes repeated leading locale path segments (e.g. `/es/en/...` from bad redirects).
 */
export function pathnameWithoutAnyLocalePrefix(
  pathname: string,
  settings: LocaleUrlSettings = FALLBACK_LANGUAGE_SETTINGS,
): string {
  let p = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const set = new Set(settings.publicLocales);
  while (true) {
    const seg = p.split("/")[1] ?? "";
    if (!seg || !set.has(seg)) break;
    p = p.slice(`/${seg}`.length) || "/";
  }
  return p;
}

export function stripLocaleFromPathname(
  pathname: string,
  settings: LocaleUrlSettings = FALLBACK_LANGUAGE_SETTINGS,
): {
  locale: string;
  pathnameWithoutLocale: string;
  hasLocalePrefix: boolean;
} {
  const p = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const firstSeg = p.split("/")[1] ?? "";
  const defaultLocale = settings.defaultLocale;
  const hasLocalePrefix =
    settings.publicLocales.includes(firstSeg) && firstSeg !== defaultLocale;
  return {
    locale: hasLocalePrefix ? firstSeg : defaultLocale,
    pathnameWithoutLocale: pathnameWithoutAnyLocalePrefix(p, settings),
    hasLocalePrefix,
  };
}

/** Canonical URLs: default locale has no prefix; others use `/{code}/...`. */
export function withLocalePath(
  pathnameWithoutLocale: string,
  locale: string,
  settings: LocaleUrlSettings = FALLBACK_LANGUAGE_SETTINGS,
): string {
  const normalized = pathnameWithoutAnyLocalePrefix(
    pathnameWithoutLocale.startsWith("/")
      ? pathnameWithoutLocale
      : `/${pathnameWithoutLocale}`,
    settings,
  );
  if (locale === settings.defaultLocale) {
    return normalized;
  }
  return `/${locale}${normalized === "/" ? "" : normalized}`;
}

/**
 * Locale-aware href for an internal link, preserving query string and hash.
 *
 * `withLocalePath` takes a bare pathname. Nav hrefs are not bare: several are
 * homepage anchors (`/#stories`), and passing one straight through would treat
 * "#stories" as a path segment and yield `/es/#stories`. So split the hash and
 * query off, prefix only the path, and re-attach.
 *
 * Anything that is not an internal absolute path (external URLs, `mailto:`,
 * `tel:`, protocol-relative `//host`, bare `#anchor`) is returned untouched —
 * there is no locale to apply to it.
 */
export function withLocaleHref(
  href: string,
  locale: string,
  settings: LocaleUrlSettings = FALLBACK_LANGUAGE_SETTINGS,
): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;

  const hashIdx = href.indexOf("#");
  const beforeHash = hashIdx === -1 ? href : href.slice(0, hashIdx);
  const hash = hashIdx === -1 ? "" : href.slice(hashIdx);

  const qIdx = beforeHash.indexOf("?");
  const pathname = qIdx === -1 ? beforeHash : beforeHash.slice(0, qIdx);
  const query = qIdx === -1 ? "" : beforeHash.slice(qIdx);

  return `${withLocalePath(pathname || "/", locale, settings)}${query}${hash}`;
}

/**
 * Rewrites a leading default-locale prefix (e.g. `/en/...` when default is `en`)
 * to the unprefixed form. Non-default locale prefixes are left intact — e.g.
 * `/es/impronta` stays `/es/impronta` so the page can render in Spanish.
 *
 * QA 2026-05-13 — Previously this delegated to `pathnameWithoutAnyLocalePrefix`,
 * which stripped ANY locale prefix in the chain. That meant `/es/impronta`
 * became `/impronta` and the proxy 308-redirected the operator off the
 * Spanish page back to the default locale before the per-tenant locale
 * enforcement layer (proxy.ts §"Phase 5 / M1") even got a chance to run.
 * Result: the editor's locale switcher offered ES, clicking ES looked broken.
 *
 * The fix is to ONLY strip when the leading segment IS the default — and to
 * recurse for the stacked-default edge case (`/en/en/...` from a bad
 * redirect). Stacked-non-default cases (`/es/en/...`) are now handled by
 * the surrounding canonicalization layers, not by silent stripping here.
 *
 * Preserves query string and hash.
 */
export function stripDefaultLocalePrefixFromPath(
  path: string,
  settings: LocaleUrlSettings = FALLBACK_LANGUAGE_SETTINGS,
): string {
  const hashIdx = path.indexOf("#");
  const beforeHash = hashIdx === -1 ? path : path.slice(0, hashIdx);
  const hash = hashIdx === -1 ? "" : path.slice(hashIdx);

  const qIdx = beforeHash.indexOf("?");
  const pathname = qIdx === -1 ? beforeHash : beforeHash.slice(0, qIdx);
  const query = qIdx === -1 ? "" : beforeHash.slice(qIdx);

  // Strip ONLY leading default-locale segments (handles `/en/en/...`).
  let p = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const def = settings.defaultLocale;
  while (true) {
    const seg = p.split("/")[1] ?? "";
    if (!seg || seg !== def) break;
    p = p.slice(`/${seg}`.length) || "/";
  }
  return `${p}${query}${hash}`;
}
