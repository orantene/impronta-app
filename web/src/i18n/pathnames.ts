import { defaultLocale, isLocale, type Locale } from "@/i18n/config";

/**
 * Removes repeated leading `/en` or `/es` segments (malformed URLs, bad redirects).
 */
export function pathnameWithoutAnyLocalePrefix(pathname: string): string {
  let p = pathname.startsWith("/") ? pathname : `/${pathname}`;
  while (true) {
    const seg = p.split("/")[1] ?? "";
    if (!isLocale(seg)) break;
    p = p.slice(`/${seg}`.length) || "/";
  }
  return p;
}

export function stripLocaleFromPathname(pathname: string): {
  locale: Locale;
  pathnameWithoutLocale: string;
  hasLocalePrefix: boolean;
} {
  const p = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const firstSeg = p.split("/")[1] ?? "";
  const hasLocalePrefix = isLocale(firstSeg);
  return {
    locale: hasLocalePrefix ? firstSeg : defaultLocale,
    pathnameWithoutLocale: pathnameWithoutAnyLocalePrefix(p),
    hasLocalePrefix,
  };
}

/** Canonical URLs: English has no `/en` prefix; Spanish stays under `/es`. */
export function withLocalePath(pathnameWithoutLocale: string, locale: Locale): string {
  const normalized = pathnameWithoutAnyLocalePrefix(
    pathnameWithoutLocale.startsWith("/")
      ? pathnameWithoutLocale
      : `/${pathnameWithoutLocale}`,
  );
  if (locale === defaultLocale) {
    return normalized;
  }
  return `/es${normalized === "/" ? "" : normalized}`;
}

/**
 * Rewrites `/en` and `/en/...` to `/` and `/...` for redirects and post-auth `next` URLs.
 * Preserves query string and hash.
 */
export function stripDefaultLocalePrefixFromPath(path: string): string {
  const hashIdx = path.indexOf("#");
  const beforeHash = hashIdx === -1 ? path : path.slice(0, hashIdx);
  const hash = hashIdx === -1 ? "" : path.slice(hashIdx);

  const qIdx = beforeHash.indexOf("?");
  const pathname = qIdx === -1 ? beforeHash : beforeHash.slice(0, qIdx);
  const query = qIdx === -1 ? "" : beforeHash.slice(qIdx);

  if (pathname === "/en" || pathname === "/en/") {
    return `/${query}${hash}`;
  }
  if (pathname.startsWith("/en/")) {
    const rest = pathname.slice("/en".length) || "/";
    return `${rest}${query}${hash}`;
  }
  return path;
}

