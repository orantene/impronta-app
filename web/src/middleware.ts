import { NextRequest, NextResponse } from "next/server";
import { stripDefaultLocalePrefixFromPath } from "@/i18n/pathnames";
import {
  isDashboardInnerPath,
  isNonDefaultLocalePrefixedPath,
  resolveLocaleForPathname,
  shouldRewriteLocalePublicPath,
  stripNonDefaultLocalePrefix,
  syncLocaleCookieForPath,
} from "@/i18n/locale-middleware";
import {
  LOCALE_HEADER,
  ORIGINAL_PATHNAME_HEADER,
} from "@/i18n/request-locale";
import { getLanguageSettingsForMiddleware } from "@/lib/language-settings/middleware-locale-cache";
import { tryCmsRedirectResponse } from "@/lib/cms/middleware-redirect";
import { rateLimitJsonResponse, tryConsumeRateLimit } from "@/lib/rate-limit";
import { updateSession } from "@/lib/supabase/middleware";
import { resolveTenantRouting } from "@/lib/saas/tenant-routing";
import { TENANT_HEADER_NAME } from "@/lib/saas/scope";

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

  // SaaS Phase 4 — subdomain tenant resolution. Runs before anything else so
  // downstream logic can rely on `x-impronta-tenant-id` being set for
  // anonymous storefront traffic. Authenticated admin traffic still flows
  // through cookie/header precedence in `getTenantScope()`.
  const hostHeader = request.headers.get("host") ?? "";
  const tenantRouting = await resolveTenantRouting(request, hostHeader);

  if (tenantRouting.kind === "not_found") {
    // Fail-hard (Plan L37): an unrecognised tenant subdomain does NOT fall
    // back to tenant #1 or the root hub. Show a 404 so the user realises
    // they are on the wrong surface, rather than silently impersonating the
    // platform hub.
    return new NextResponse("Tenant not found for this hostname.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const langSettings = await getLanguageSettingsForMiddleware();

  const parts = pathname.split("/");
  if (parts[1]) {
    const canonical = langSettings.publicLocales.find(
      (c) => c.toLowerCase() === parts[1].toLowerCase(),
    );
    if (canonical && parts[1] !== canonical) {
      parts[1] = canonical;
      const url = request.nextUrl.clone();
      url.pathname = parts.join("/") || "/";
      return NextResponse.redirect(url, 308);
    }
  }

  const withoutLocalePrefix = stripDefaultLocalePrefixFromPath(pathname, langSettings);
  if (withoutLocalePrefix !== pathname) {
    const url = request.nextUrl.clone();
    url.pathname = withoutLocalePrefix;
    return NextResponse.redirect(url, 308);
  }

  if (pathname.startsWith("/api/directory") && request.method === "GET") {
    if (!tryConsumeRateLimit(`dir-api:${ip}`, 120, 60_000)) {
      return rateLimitJsonResponse();
    }
  }

  if (pathname === "/api/ai/search" && request.method === "POST") {
    if (!tryConsumeRateLimit(`dir-ai-search:${ip}`, 180, 60_000)) {
      return rateLimitJsonResponse();
    }
  }

  if (pathname === "/api/admin/ai/search-debug" && request.method === "POST") {
    if (!tryConsumeRateLimit(`admin-ai-search-debug:${ip}`, 45, 60_000)) {
      return rateLimitJsonResponse();
    }
  }

  if (pathname === "/api/ai/refine-suggestions" && request.method === "POST") {
    if (!tryConsumeRateLimit(`dir-ai-refine:${ip}`, 90, 60_000)) {
      return rateLimitJsonResponse();
    }
  }

  if (pathname === "/api/ai/inquiry-draft" && request.method === "POST") {
    if (!tryConsumeRateLimit(`dir-ai-inquiry-draft:${ip}`, 24, 60_000)) {
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

  if (isNonDefaultLocalePrefixedPath(originalPathname, langSettings)) {
    const inner = stripNonDefaultLocalePrefix(originalPathname, langSettings);
    if (isDashboardInnerPath(inner)) {
      const url = request.nextUrl.clone();
      url.pathname = inner;
      return NextResponse.redirect(url, 308);
    }
  }

  const cmsRedirect = await tryCmsRedirectResponse(request, originalPathname);
  if (cmsRedirect) {
    syncLocaleCookieForPath(cmsRedirect, originalPathname, langSettings);
    return cmsRedirect;
  }

  const locale = resolveLocaleForPathname(originalPathname, request, langSettings);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(LOCALE_HEADER, locale);
  requestHeaders.set(ORIGINAL_PATHNAME_HEADER, originalPathname);

  if (tenantRouting.kind === "subdomain" || tenantRouting.kind === "custom") {
    requestHeaders.set(TENANT_HEADER_NAME, tenantRouting.tenantId);
  } else {
    // On the platform root, strip any spoofed header — the storefront must
    // not honour arbitrary client-provided tenant ids.
    requestHeaders.delete(TENANT_HEADER_NAME);
  }

  let pathnameForAuth = originalPathname;
  const nextUrl = request.nextUrl.clone();

  if (shouldRewriteLocalePublicPath(originalPathname, langSettings)) {
    nextUrl.pathname = stripNonDefaultLocalePrefix(originalPathname, langSettings);
    pathnameForAuth = nextUrl.pathname;
  }

  const innerRequest = new NextRequest(nextUrl, {
    headers: requestHeaders,
    method: request.method,
  });

  const sessionRes = await updateSession(innerRequest, {
    pathnameForAuth,
    languageSettings: langSettings,
  });

  if (sessionRes.headers.get("location")) {
    syncLocaleCookieForPath(sessionRes, originalPathname, langSettings);
    return sessionRes;
  }

  if (shouldRewriteLocalePublicPath(originalPathname, langSettings)) {
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

    syncLocaleCookieForPath(res, originalPathname, langSettings);
    return res;
  }

  syncLocaleCookieForPath(sessionRes, originalPathname, langSettings);
  return sessionRes;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
