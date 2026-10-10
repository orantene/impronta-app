import type { NextRequest, NextResponse } from "next/server";

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
 * Attach Cache-Control (and Vercel CDN variants) for a talent_site host
 * response. Public CDN cache only when the request is a safe read, the
 * visitor has no auth/guest/locale cookie (path-locale-only), and the
 * response itself sets no cookies.
 */
export function applyTalentSiteAnonCacheHeaders(
  res: NextResponse,
  request: NextRequest,
): NextResponse {
  const method = request.method.toUpperCase();
  const isSafeRead = method === "GET" || method === "HEAD";
  const cookieless =
    !hasSupabaseAuthCookie(request) &&
    !request.cookies.get(GUEST_COOKIE_NAME)?.value &&
    talentSiteLocaleIsPathOnly(request);
  const canCdnCache = isSafeRead && cookieless && !responseSetsCookies(res);

  const value = canCdnCache ? TALENT_SITE_ANON_CDN_CACHE : TALENT_SITE_PRIVATE_NO_STORE;
  res.headers.set("Cache-Control", value);
  // Vercel: CDN-specific directives override Cache-Control for the edge.
  res.headers.set("CDN-Cache-Control", value);
  res.headers.set("Vercel-CDN-Cache-Control", value);
  return res;
}
