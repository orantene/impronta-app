import { type NextRequest, NextResponse } from "next/server";
import { defaultLocale, isLocale, type Locale } from "@/i18n/config";
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

/** Dashboard roots must never use `/es` prefix — strip if present. */
export function isDashboardInnerPath(pathWithoutLeadingEs: string): boolean {
  const seg = firstSegment(pathWithoutLeadingEs);
  return seg === "admin" || seg === "talent" || seg === "client";
}

function readLocaleCookie(request: NextRequest): Locale | null {
  const v = request.cookies.get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : null;
}

function acceptLanguagePrefersSpanish(header: string | null): boolean {
  if (!header) return false;
  const parts = header.split(",");
  for (const part of parts) {
    const code = part.split(";")[0]?.trim().toLowerCase() ?? "";
    if (code.startsWith("es")) return true;
  }
  return false;
}

/**
 * Unprefixed paths that participate in EN URL + optional redirect to /es.
 * Excludes API, Next internals, auth, dashboards, onboarding.
 */
export function isUnprefixedPublicEnglishPath(pathname: string): boolean {
  if (pathname.startsWith("/api") || pathname.startsWith("/_next")) return false;
  /** Already Spanish URL — do not run EN→ES redirect (would stack `/es/es/...`). */
  if (pathname === "/es" || pathname.startsWith("/es/")) return false;
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

/** `/es` or `/es/...` before rewrite. */
export function isSpanishPrefixedPath(pathname: string): boolean {
  return pathname === "/es" || pathname.startsWith("/es/");
}

/**
 * Inner path after removing `/es` prefix (`/` for `/es`).
 */
export function stripSpanishPrefix(pathname: string): string {
  let p = pathname.startsWith("/") ? pathname : `/${pathname}`;
  while (p === "/es" || p === "/es/" || p.startsWith("/es/")) {
    if (p === "/es" || p === "/es/") return "/";
    p = p.slice("/es".length) || "/";
  }
  return p;
}

/**
 * Spanish public URL → always `es`. English public URL → `en`.
 * Dashboards / auth → cookie for UI language.
 * Always pass the **browser** pathname (e.g. `/es/directory`), not the rewrite target.
 */
export function resolveLocaleForPathname(
  pathname: string,
  request: NextRequest,
): Locale {
  if (isSpanishPrefixedPath(pathname)) {
    const inner = stripSpanishPrefix(pathname);
    if (!isDashboardInnerPath(inner)) {
      return "es";
    }
  }

  if (isDashboardInnerPath(pathname)) {
    return readLocaleCookie(request) ?? defaultLocale;
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
    return readLocaleCookie(request) ?? defaultLocale;
  }

  if (isUnprefixedPublicEnglishPath(pathname)) {
    return "en";
  }

  return readLocaleCookie(request) ?? defaultLocale;
}

/**
 * Should we internally rewrite `/es/...` → `/...` for Next route resolution?
 * Only for public paths (not dashboard under /es — those redirect earlier).
 */
export function shouldRewriteSpanishPublicPath(pathname: string): boolean {
  if (!isSpanishPrefixedPath(pathname)) return false;
  const inner = stripSpanishPrefix(pathname);
  return !isDashboardInnerPath(inner);
}

export function preferredPublicLocaleFromNegotiation(
  request: NextRequest,
): Locale {
  const cookie = readLocaleCookie(request);
  if (cookie) return cookie;
  if (acceptLanguagePrefersSpanish(request.headers.get("accept-language"))) {
    return "es";
  }
  return "en";
}

/**
 * Apply plan §2 cookie sync for public URLs (after we know final response path intent).
 */
export function syncLocaleCookieForPath(
  res: import("next/server").NextResponse,
  originalPathname: string,
): void {
  if (isSpanishPrefixedPath(originalPathname)) {
    const inner = stripSpanishPrefix(originalPathname);
    if (!isDashboardInnerPath(inner)) {
      res.cookies.set(LOCALE_COOKIE, "es", localeCookieOptions);
    }
    return;
  }
  if (isUnprefixedPublicEnglishPath(originalPathname)) {
    res.cookies.set(LOCALE_COOKIE, "en", localeCookieOptions);
  }
}

export function redirectToSpanishEquivalent(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone();
  const { pathnameWithoutLocale } = stripLocaleFromPathname(
    request.nextUrl.pathname,
  );
  url.pathname = withLocalePath(pathnameWithoutLocale, "es");
  const res = NextResponse.redirect(url, 307);
  res.cookies.set(LOCALE_COOKIE, "es", localeCookieOptions);
  return res;
}
