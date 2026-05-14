import type { LanguageSettings } from "@/lib/language-settings/types";
import { FALLBACK_LANGUAGE_SETTINGS } from "@/lib/language-settings/fetch-language-settings";

/**
 * Removes repeated leading locale path segments (e.g. `/es/en/...` from bad redirects).
 */
export function pathnameWithoutAnyLocalePrefix(
  pathname: string,
  settings: LanguageSettings = FALLBACK_LANGUAGE_SETTINGS,
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
  settings: LanguageSettings = FALLBACK_LANGUAGE_SETTINGS,
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
  settings: LanguageSettings = FALLBACK_LANGUAGE_SETTINGS,
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
  settings: LanguageSettings = FALLBACK_LANGUAGE_SETTINGS,
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
