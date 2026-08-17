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

function isDashboardSurfaceSegment(seg: string): boolean {
  return seg === "admin" || seg === "talent" || seg === "client";
}

/**
 * Dashboard roots must never use a non-default locale prefix — strip if present.
 * Recognizes both unprefixed (`/admin/...`) and tenant-prefixed (`/<slug>/admin/...`)
 * paths so multi-tenant workspace URLs are treated as dashboard surfaces.
 *
 * NOTE: left unmodified on purpose. This function is also used on genuinely
 * unprefixed paths (e.g. `isUnprefixedPublicDefaultPath`, and the fallback
 * branch of `resolveLocaleForPathname` below) where `/talent/register` and
 * `/client/register` MUST keep counting as dashboard-inner so a visitor's
 * locale cookie still applies when they land on the bare (non-`/es/`) URL —
 * see `feedback_...` history on this file for how easy it is to silently
 * regress cookie-based dashboard locale here. The A1 carve-out for the two
 * retired signup-redirect stubs lives in `isDashboardInnerPathForLocalePrefix`
 * below, applied ONLY where the caller already knows the path arrived via an
 * explicit non-default locale prefix that was just stripped off.
 */
export function isDashboardInnerPath(pathWithoutLeadingLocale: string): boolean {
  const p = pathWithoutLeadingLocale.startsWith("/") ? pathWithoutLeadingLocale : `/${pathWithoutLeadingLocale}`;
  const parts = p.split("/").filter(Boolean);
  if (parts.length === 0) return false;
  if (isDashboardSurfaceSegment(parts[0])) return true;
  if (parts.length >= 2 && isDashboardSurfaceSegment(parts[1])) return true;
  return false;
}

/**
 * Retired public signup redirect stubs — `(auth)/talent/register/page.tsx` and
 * `(auth)/client/register/page.tsx` (see register-intent.ts / A1 audit). Their
 * first path segment ("talent"/"client") collides with `isDashboardSurfaceSegment`
 * even though they are pre-auth pages, not real dashboard shells: a fresh
 * visitor hits them once and is immediately `permanentRedirect`ed into
 * `/register?as=...`, they never render dashboard chrome, and they carry no
 * cookie-derived per-user state. `/join` is unaffected: "join" is not a
 * dashboard-surface word, so `isDashboardInnerPath` never matched it.
 */
const RETIRED_LOCALE_SENSITIVE_AUTH_STUBS = new Set(["/talent/register", "/client/register"]);

/**
 * `isDashboardInnerPath`, but for the locale-prefix machinery specifically:
 * the argument here is ALWAYS the result of stripping a confirmed non-default
 * locale prefix (callers guard this behind `isNonDefaultLocalePrefixedPath`
 * first), so it is safe to answer "no" for the two retired stubs without
 * touching how a genuinely unprefixed `/talent/register` resolves elsewhere.
 * This is what lets `/es/talent/register` and `/es/client/register` keep
 * their `/es/` segment all the way to the page (the hard 308 strip in
 * proxy.ts, the internal-rewrite decision, and the header-locale resolution
 * below all call this instead of `isDashboardInnerPath` directly).
 */
export function isDashboardInnerPathForLocalePrefix(strippedInner: string): boolean {
  const p = strippedInner.startsWith("/") ? strippedInner : `/${strippedInner}`;
  if (RETIRED_LOCALE_SENSITIVE_AUTH_STUBS.has(p)) return false;
  return isDashboardInnerPath(p);
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
  if (isDashboardInnerPath(pathname)) return false;
  const seg = firstSegment(pathname);
  if (
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

/*
 * `acceptLanguageMatchesLocale` + `preferredPublicLocaleFromNegotiation` were
 * REMOVED here (2026-08-16), not moved. They had zero call sites repo-wide —
 * nothing in the app had ever read the browser language — and they were a
 * latent hazard: `preferredPublicLocaleFromNegotiation` returns a locale to
 * SERVE, which is precisely the design that was rejected for the language
 * suggestion banner (same URL, different language by header ⇒ Googlebot,
 * crawling with English headers, never sees the Spanish content, and every
 * shared cache key becomes ambiguous).
 *
 * Browser-language handling now lives in `@/i18n/locale-suggestion`, which is
 * pure, q-value aware, and can only produce a dismissible SUGGESTION — it has
 * no way to change what a URL serves. There is deliberately no second
 * implementation left in this file.
 */

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
    if (!isDashboardInnerPathForLocalePrefix(inner)) {
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
  return !isDashboardInnerPathForLocalePrefix(inner);
}

export function syncLocaleCookieForPath(
  res: import("next/server").NextResponse,
  originalPathname: string,
  settings: LanguageSettings = FALLBACK_LANGUAGE_SETTINGS,
  request?: import("next/server").NextRequest,
): void {
  if (isNonDefaultLocalePrefixedPath(originalPathname, settings)) {
    const inner = stripNonDefaultLocalePrefix(originalPathname, settings);
    if (!isDashboardInnerPathForLocalePrefix(inner)) {
      const loc = firstSegment(originalPathname);
      res.cookies.set(LOCALE_COOKIE, loc, localeCookieOptions);
    }
    return;
  }
  if (isUnprefixedPublicDefaultPath(originalPathname, settings)) {
    // QA 2026-05-13 — previously this unconditionally wrote
    // `locale=<defaultLocale>`, which clobbered an explicit non-default
    // choice the operator had just made. Concrete repro:
    //   1. operator clicks ES toggle, switcher pushes `/es/impronta`
    //   2. proxy.ts 308's that to `/impronta` and sets `locale=es`
    //   3. browser follows redirect to `/impronta`
    //   4. THIS line ran and overwrote the cookie back to `locale=en`
    //   5. page renders in EN — switcher appears broken
    // Now we respect an existing locale cookie that names a supported
    // public locale. Fresh visits (no cookie) still get the default,
    // matching prior behavior.
    const existing = request?.cookies?.get(LOCALE_COOKIE)?.value;
    const existingIsSupported =
      existing && settings.publicLocales.some((l) => l === existing);
    if (existingIsSupported) return;
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
