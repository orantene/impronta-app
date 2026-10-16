import type { NextRequest, NextResponse } from "next/server";

import { LOCALE_AUTO_COOKIE } from "@/i18n/locale-cookies";
import { LOCALE_COOKIE } from "@/i18n/locale-middleware";
import { hasSupabaseAuthCookie } from "@/lib/client-account/talent-host-session";
import { GUEST_COOKIE_NAME } from "@/lib/guest-cookie";

/**
 * Short CDN cache for anonymous, cookieless GETs of public talent pages
 * (TUL-445). Publish visibility is bounded by s-maxage + SWR; signed-in
 * visitors and anyone already carrying `impronta_guest` stay uncached so SSR
 * resume HTML is never shared across guests.
 *
 * Locale is path-only for CDN-cached responses: we refuse public cache when a
 * `locale` cookie is present (that cookie would otherwise select a language
 * that is not in the URL). Prefixed paths (`/en/...`) and the talent primary
 * at `/` are distinct URLs, so no `Vary` is required for locale. Cookie /
 * Accept-Language are not part of the cache key because cookie-bearing
 * requests never enter this public branch.
 */
export const TALENT_SITE_ANON_CDN_CACHE =
  "public, s-maxage=60, stale-while-revalidate=300";

export const TALENT_SITE_PRIVATE_NO_STORE = "private, no-store";

/**
 * TUL-445 live QA fail: the CDN cache key ignored cookies, so a signed-in or
 * guest-cookied visitor could be served the stored anonymous page (whose
 * request carried no cookie). `Vary: Cookie` on EVERY talent-site response
 * means an entry stored for a cookieless request never matches a request that
 * carries any cookie; that request goes to the origin, which answers private,
 * no-store. Cost: visitors holding any cookie miss the CDN; correctness wins.
 */
function addVaryCookie(res: NextResponse): void {
  const existing = res.headers.get("Vary");
  const parts = existing ? existing.split(",").map((v) => v.trim()).filter(Boolean) : [];
  if (parts.some((v) => v === "*" || v.toLowerCase() === "cookie")) return;
  parts.push("Cookie");
  res.headers.set("Vary", parts.join(", "));
}

function responseSetsCookies(res: NextResponse): boolean {
  return res.cookies.getAll().length > 0;
}

/**
 * True when this request's talent-site locale can only come from the URL path
 * (prefix or primary default) — not from a `locale` cookie.
 */
export function talentSiteLocaleIsPathOnly(request: NextRequest): boolean {
  return !request.cookies.get(LOCALE_COOKIE)?.value;
}

/**
 * Whether an explicit talent-site language (a `/<code>/` prefix or a
 * `?locale=` switch) must be written to the `locale` cookie. On a talent host
 * the URL decides the language and the cookie never overrides it, so a
 * cookieless page view under `/en` gains nothing from the write, and the
 * Set-Cookie alone makes every anonymous `/en` view an uncacheable MISS. The
 * write still happens when it records a real change: a `?locale=` redirect, a
 * cookie naming another language, or a machine-written cookie becoming a choice.
 */
export function talentSiteShouldRememberLocale(
  request: NextRequest,
  locale: string,
  opts: { redirect: boolean },
): boolean {
  if (opts.redirect) return true;
  const existing = request.cookies.get(LOCALE_COOKIE)?.value;
  if (!existing) return false;
  return existing !== locale || Boolean(request.cookies.get(LOCALE_AUTO_COOKIE)?.value);
}

/**
 * Attach Cache-Control (and Vercel CDN variants) for a talent_site host
 * response. Public CDN cache only when the request is a safe read, the
 * visitor has no auth/guest/locale cookie (path-locale-only), and the
 * response itself sets no cookies.
 */
/**
 * TUL-755 live QA fail: Next rewrites `Vary` on app-router HTML, so the
 * `Vary: Cookie` set below never reaches the CDN and a cookie-bearing request
 * was answered from the anonymous entry (x-vercel-cache: HIT). Routing
 * middleware runs before the CDN lookup, so a request that must stay private
 * is rewritten to the same URL plus this param: a cache key no anonymous
 * request ever uses. The page ignores the param.
 */
export const TALENT_SITE_PRIVATE_KEY_PARAM = "__pv";

/** True when this request may be served from (and stored in) the shared CDN entry. */
export function talentSiteRequestIsCookieless(request: NextRequest): boolean {
  return (
    !hasSupabaseAuthCookie(request) &&
    !request.cookies.get(GUEST_COOKIE_NAME)?.value &&
    talentSiteLocaleIsPathOnly(request)
  );
}

/**
 * The URL to serve a talent-site request from. Cookie-bearing requests get the
 * private cache key; cookieless ones (and anything already keyed) are unchanged.
 * Returns null when no rewrite is needed.
 */
export function talentSitePrivateCacheKeyUrl(request: NextRequest, url: URL): URL | null {
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return null; // never cached; leave actions alone
  if (talentSiteRequestIsCookieless(request)) return null;
  if (url.searchParams.has(TALENT_SITE_PRIVATE_KEY_PARAM)) return null;
  const keyed = new URL(url);
  keyed.searchParams.set(TALENT_SITE_PRIVATE_KEY_PARAM, "1");
  return keyed;
}

export function applyTalentSiteAnonCacheHeaders(
  res: NextResponse,
  request: NextRequest,
): NextResponse {
  const method = request.method.toUpperCase();
  const isSafeRead = method === "GET" || method === "HEAD";
  const cookieless = talentSiteRequestIsCookieless(request);
  const canCdnCache = isSafeRead && cookieless && !responseSetsCookies(res);

  const value = canCdnCache ? TALENT_SITE_ANON_CDN_CACHE : TALENT_SITE_PRIVATE_NO_STORE;
  res.headers.set("Cache-Control", value);
  // Vercel: CDN-specific directives override Cache-Control for the edge.
  res.headers.set("CDN-Cache-Control", value);
  res.headers.set("Vercel-CDN-Cache-Control", value);
  addVaryCookie(res);
  return res;
}
