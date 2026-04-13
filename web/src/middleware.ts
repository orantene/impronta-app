import { NextRequest, NextResponse } from "next/server";
import { stripDefaultLocalePrefixFromPath } from "@/i18n/pathnames";
import {
  isDashboardInnerPath,
  isSpanishPrefixedPath,
  resolveLocaleForPathname,
  shouldRewriteSpanishPublicPath,
  stripSpanishPrefix,
  syncLocaleCookieForPath,
} from "@/i18n/locale-middleware";
import {
  LOCALE_HEADER,
  ORIGINAL_PATHNAME_HEADER,
} from "@/i18n/request-locale";
import { rateLimitJsonResponse, tryConsumeRateLimit } from "@/lib/rate-limit";
import { updateSession } from "@/lib/supabase/middleware";

/** See `rate-limit.ts` — in-memory, per-instance throttles only. */

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return "unknown";
}

export async function middleware(request: NextRequest) {
  const ip = clientIp(request);
  const { pathname } = request.nextUrl;

  const parts = pathname.split("/");
  if (
    parts[1] &&
    parts[1].toLowerCase() === "es" &&
    parts[1] !== "es"
  ) {
    parts[1] = "es";
    const url = request.nextUrl.clone();
    url.pathname = parts.join("/") || "/";
    return NextResponse.redirect(url, 308);
  }

  const withoutEn = stripDefaultLocalePrefixFromPath(pathname);
  if (withoutEn !== pathname) {
    const url = request.nextUrl.clone();
    url.pathname = withoutEn;
    return NextResponse.redirect(url, 308);
  }

  if (pathname.startsWith("/api/directory") && request.method === "GET") {
    if (!tryConsumeRateLimit(`dir-api:${ip}`, 120, 60_000)) {
      return rateLimitJsonResponse();
    }
  }

  if (
    (pathname.startsWith("/api/location-place-details") ||
      pathname.startsWith("/api/location-country-details")) &&
    request.method === "GET"
  ) {
    if (!tryConsumeRateLimit(`loc-google:${ip}`, 45, 60_000)) {
      return rateLimitJsonResponse();
    }
  }

  if (
    (pathname.startsWith("/api/location-cities") ||
      pathname.startsWith("/api/location-countries")) &&
    request.method === "GET"
  ) {
    if (!tryConsumeRateLimit(`loc-db:${ip}`, 150, 60_000)) {
      return rateLimitJsonResponse();
    }
  }

  if (
    pathname === "/directory/cart" &&
    request.method === "POST" &&
    request.headers.has("next-action")
  ) {
    if (!tryConsumeRateLimit(`inquiry:${ip}`, 30, 60_000)) {
      return rateLimitJsonResponse();
    }
  }

  const originalPathname = request.nextUrl.pathname;

  if (isSpanishPrefixedPath(originalPathname)) {
    const inner = stripSpanishPrefix(originalPathname);
    if (isDashboardInnerPath(inner)) {
      const url = request.nextUrl.clone();
      url.pathname = inner;
      return NextResponse.redirect(url, 308);
    }
  }

  /**
   * Unprefixed public URLs are English (plan). Do not redirect to `/es` from cookie or
   * Accept-Language — that breaks the EN toggle (same request still has `locale=es` cookie).
   * Users choose Spanish via `/es/...` or the ES control.
   */

  const locale = resolveLocaleForPathname(originalPathname, request);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(LOCALE_HEADER, locale);
  requestHeaders.set(ORIGINAL_PATHNAME_HEADER, originalPathname);

  let pathnameForAuth = originalPathname;
  const nextUrl = request.nextUrl.clone();

  if (shouldRewriteSpanishPublicPath(originalPathname)) {
    nextUrl.pathname = stripSpanishPrefix(originalPathname);
    pathnameForAuth = nextUrl.pathname;
  }

  const innerRequest = new NextRequest(nextUrl, {
    headers: requestHeaders,
    method: request.method,
  });

  const sessionRes = await updateSession(innerRequest, {
    pathnameForAuth,
  });

  if (sessionRes.headers.get("location")) {
    syncLocaleCookieForPath(sessionRes, originalPathname);
    return sessionRes;
  }

  /**
   * Next.js 16: `NextResponse.next({ request: innerRequest })` no longer maps `/es/...`
   * to app routes — Spanish URLs 404. Explicit rewrite keeps the browser on `/es` while
   * resolving `(public)/...` and `page.tsx` at the stripped path.
   */
  if (shouldRewriteSpanishPublicPath(originalPathname)) {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = pathnameForAuth;

    const res = NextResponse.rewrite(rewriteUrl, {
      request: { headers: requestHeaders },
    });

    for (const cookie of sessionRes.cookies.getAll()) {
      res.cookies.set(cookie);
    }

    sessionRes.headers.forEach((value, key) => {
      if (key.toLowerCase().startsWith("x-impronta-")) {
        res.headers.set(key, value);
      }
    });

    syncLocaleCookieForPath(res, originalPathname);
    return res;
  }

  syncLocaleCookieForPath(sessionRes, originalPathname);
  return sessionRes;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
