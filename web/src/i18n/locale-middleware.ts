import { type NextRequest, NextResponse } from "next/server";
import type { LanguageSettings } from "@/lib/language-settings/types";
import { FALLBACK_LANGUAGE_SETTINGS } from "@/lib/language-settings/fetch-language-settings";
import { stripLocaleFromPathname, withLocalePath } from "@/i18n/pathnames";

/** Public cookie name (plan §2). */
export const LOCALE_COOKIE = "locale";

const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

export const localeCookieOptions = {
  path: "/",
  maxAge: LOCALE_COOKIE_MAX_AGE,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};

function firstSegment(pathname: string): string {
  const p = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return p.split("/")[1] ?? "";
}

/** Dashboard roots must never use a non-default locale prefix — strip if present. */
export function isDashboardInnerPath(pathWithoutLeadingLocale: string): boolean {
  const seg = firstSegment(pathWithoutLeadingLocale);
  return seg === "admin" || seg === "talent" || seg === "client";
}

function nonDefaultPublicLocales(settings: LanguageSettings): Set<string> {
  return new Set(settings.publicLocales.filter((c) => c !== settings.defaultLocale));
}

export function readLocaleCookie(request: NextRequest, settings: LanguageSettings): string | null {
  const v = request.cookies.get(LOCALE_COOKIE)?.value;
  if (!v) return null;
  if (settings.publicLocales.includes(v)) return v;
  if (v === settings.defaultLocale) return v;
  return null;
}

/** `/es/...` or `/fr/...` when those are enabled non-default public locales. */
export function isNonDefaultLocalePrefixedPath(
  pathname: string,
  settings: LanguageSettings = FALLBACK_LANGUAGE_SETTINGS,
): boolean {
  const seg = firstSegment(pathname);
  return nonDefaultPublicLocales(settings).has(seg);
}

/**
 * Strip leading non-default locale segments (e.g. `/es` → `/`, `/es/foo` → `/foo`).
 */
export function stripNonDefaultLocalePrefix(
  pathname: string,
  settings: LanguageSettings = FALLBACK_LANGUAGE_SETTINGS,
): string {
  let p = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const nd = nonDefaultPublicLocales(settings);
  while (true) {
    const seg = p.split("/")[1] ?? "";
    if (!nd.has(seg)) break;
    if (p === `/${seg}` || p === `/${seg}/`) {
      p = "/";
      break;
    }
    p = p.slice(`/${seg}`.length) || "/";
  }
  return p;
}

/**
 * Unprefixed paths that use the **default** public locale URL (no `/{code}` prefix).
 */
export function isUnprefixedPublicDefaultPath(
  pathname: string,
  settings: LanguageSettings = FALLBACK_LANGUAGE_SETTINGS,
): boolean {
  if (pathname.startsWith("/api") || pathname.startsWith("/_next")) return false;
  if (isNonDefaultLocalePrefixedPath(pathname, settings)) return false;
  const seg = firstSegment(pathname);
  if (
    seg === "admin" ||
    seg === "talent" ||
    seg === "client" ||
    seg === "login" ||
    seg === "register" ||
    seg === "forgot-password" ||
    seg === "auth" ||
    seg === "onboarding" ||
    seg === "update-password"
  ) {
    return false;
  }
  return true;
}

function acceptLanguageMatchesLocale(header: string | null, localeCode: string): boolean {
  if (!header) return false;
  const primary = localeCode.toLowerCase().split("-")[0] ?? localeCode;
  const parts = header.split(",");
  for (const part of parts) {
    const code = part.split(";")[0]?.trim().toLowerCase() ?? "";
    if (code.startsWith(localeCode.toLowerCase())) return true;
    if (code.startsWith(primary)) return true;
  }
  return false;
}

/**
 * Spanish public URL → that locale. Default-locale public URL → default.
 * Dashboards / auth → cookie for UI language.
 */
export function resolveLocaleForPathname(
  pathname: string,
  request: NextRequest,
  settings: LanguageSettings = FALLBACK_LANGUAGE_SETTINGS,
): string {
  if (isNonDefaultLocalePrefixedPath(pathname, settings)) {
    const inner = stripNonDefaultLocalePrefix(pathname, settings);
    if (!isDashboardInnerPath(inner)) {
      return firstSegment(pathname);
    }
  }

  if (isDashboardInnerPath(pathname)) {
    return readLocaleCookie(request, settings) ?? settings.defaultLocale;
  }

  const seg = firstSegment(pathname);
  if (
    seg === "login" ||
    seg === "register" ||
    seg === "forgot-password" ||
    seg === "auth" ||
    seg === "onboarding" ||
    seg === "update-password"
  ) {
    return readLocaleCookie(request, settings) ?? settings.defaultLocale;
  }

  if (isUnprefixedPublicDefaultPath(pathname, settings)) {
    return settings.defaultLocale;
  }

  return readLocaleCookie(request, settings) ?? settings.defaultLocale;
}

export function shouldRewriteLocalePublicPath(
  pathname: string,
  settings: LanguageSettings = FALLBACK_LANGUAGE_SETTINGS,
): boolean {
  if (!isNonDefaultLocalePrefixedPath(pathname, settings)) return false;
  const inner = stripNonDefaultLocalePrefix(pathname, settings);
  return !isDashboardInnerPath(inner);
}

export function preferredPublicLocaleFromNegotiation(
  request: NextRequest,
  settings: LanguageSettings = FALLBACK_LANGUAGE_SETTINGS,
): string {
  const cookie = readLocaleCookie(request, settings);
  if (cookie) return cookie;

  const header = request.headers.get("accept-language");
  const ordered = [...settings.publicLocales].sort((a, b) => {
    if (a === settings.defaultLocale) return -1;
    if (b === settings.defaultLocale) return 1;
    return a.localeCompare(b);
  });

  for (const code of ordered) {
    if (code !== settings.defaultLocale && acceptLanguageMatchesLocale(header, code)) {
      return code;
    }
  }
  if (acceptLanguageMatchesLocale(header, settings.defaultLocale)) {
    return settings.defaultLocale;
  }
  return settings.defaultLocale;
}

export function syncLocaleCookieForPath(
  res: import("next/server").NextResponse,
  originalPathname: string,
  settings: LanguageSettings = FALLBACK_LANGUAGE_SETTINGS,
): void {
  if (isNonDefaultLocalePrefixedPath(originalPathname, settings)) {
    const inner = stripNonDefaultLocalePrefix(originalPathname, settings);
    if (!isDashboardInnerPath(inner)) {
      const loc = firstSegment(originalPathname);
      res.cookies.set(LOCALE_COOKIE, loc, localeCookieOptions);
    }
    return;
  }
  if (isUnprefixedPublicDefaultPath(originalPathname, settings)) {
    res.cookies.set(LOCALE_COOKIE, settings.defaultLocale, localeCookieOptions);
  }
}

export function redirectToLocaleEquivalent(
  request: NextRequest,
  locale: string,
  settings: LanguageSettings = FALLBACK_LANGUAGE_SETTINGS,
): NextResponse {
  const url = request.nextUrl.clone();
  const { pathnameWithoutLocale } = stripLocaleFromPathname(request.nextUrl.pathname, settings);
  url.pathname = withLocalePath(pathnameWithoutLocale, locale, settings);
  const res = NextResponse.redirect(url, 307);
  res.cookies.set(LOCALE_COOKIE, locale, localeCookieOptions);
  return res;
}

/** @deprecated Use `redirectToLocaleEquivalent` with explicit locale. */
export function redirectToSpanishEquivalent(request: NextRequest): NextResponse {
  return redirectToLocaleEquivalent(request, "es", FALLBACK_LANGUAGE_SETTINGS);
}
