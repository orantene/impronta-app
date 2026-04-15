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
 * Rewrites `/en` and `/en/...` (or any locale prefix) to `/` and `/...` for redirects and post-auth `next` URLs.
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

  const rest = pathnameWithoutAnyLocalePrefix(pathname, settings);
  return `${rest}${query}${hash}`;
}
