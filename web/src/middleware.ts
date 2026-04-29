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
import {
  rateLimitHtmlResponse,
  rateLimitJsonResponse,
  tryConsumeRateLimit,
} from "@/lib/rate-limit";
import { updateSession } from "@/lib/supabase/middleware";
import {
  resolveTenantContext,
  HOST_CONTEXT_HEADER,
  HOST_NAME_HEADER,
} from "@/lib/saas/host-context";
import { TENANT_HEADER_NAME } from "@/lib/saas/scope";
import { isPathAllowedForHostKind } from "@/lib/saas/surface-allow-list";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";
import {
  PREVIEW_COOKIE_OPTIONS,
  PREVIEW_QUERY_PARAM,
  previewCookieNameFor,
} from "@/lib/site-admin/preview/cookie";
import { readPreviewFromQueryParam } from "@/lib/site-admin/preview/middleware";
import { TULALA_APEX_HOST, TULALA_WWW_HOST } from "@/lib/brand/tulala";

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

  // SaaS Phase 4 — unified host resolution. Every hostname (marketing /
  // app / hub / agency) is resolved via a single DB-driven lookup in
  // `agency_domains`. No hostnames are hardcoded in code. Downstream
  // server code reads the resulting context from request headers.
  const hostHeader = request.headers.get("host") ?? "";

  // Canonical apex redirect. Vercel's own domain-level redirect for the
  // www → apex redirect can't be configured while the apex is ghost-attached
  // to a deleted Vercel project (see project memory). Handle it here so SEO
  // stays consistent regardless of which host the request lands on.
  if (hostHeader.toLowerCase() === TULALA_WWW_HOST) {
    const target = new URL(request.url);
    target.hostname = TULALA_APEX_HOST;
    target.port = "";
    return NextResponse.redirect(target, 308);
  }

  const hostContext = await resolveTenantContext(request, hostHeader);

  if (hostContext.kind === "not_found") {
    // Fail-hard (Plan L37): an unregistered hostname does NOT fall back
    // to tenant #1 or the hub. A 404 tells the operator the domain needs
    // seeding in `agency_domains`.
    return new NextResponse("Host not registered. Seed agency_domains.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  // ── Preview handoff ─────────────────────────────────────────────────────
  // Admin iframes the storefront with `?preview=<jwt>`. On the first hit we
  // verify the token, set a tenant-scoped HttpOnly cookie, and 302-redirect
  // to the same URL with the param stripped. Subsequent loads within the
  // iframe are cookie-driven so the JWT never touches browser history or
  // server access logs past the entry.
  if (
    (hostContext.kind === "agency" || hostContext.kind === "hub") &&
    request.nextUrl.searchParams.has(PREVIEW_QUERY_PARAM)
  ) {
    const previewResult = await readPreviewFromQueryParam(
      request,
      hostContext.tenantId,
    );
    if (previewResult.ok) {
      const clean = request.nextUrl.clone();
      clean.searchParams.delete(PREVIEW_QUERY_PARAM);
      const res = NextResponse.redirect(clean, 302);
      res.cookies.set(
        previewCookieNameFor(hostContext.tenantId),
        previewResult.token,
        { ...PREVIEW_COOKIE_OPTIONS },
      );
      return res;
    }
    // Invalid / expired / wrong-tenant token: strip the param silently and
    // proceed as a normal published request. No error UI here — the panel
    // will mint a fresh token on the next cycle.
    const clean = request.nextUrl.clone();
    clean.searchParams.delete(PREVIEW_QUERY_PARAM);
    return NextResponse.redirect(clean, 302);
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

  // Phase 5 / M1 — per-tenant locale enforcement. A tenant publishes a subset
  // of platform locales (`agency_business_identity.supported_locales`). When
  // the URL carries an explicit locale prefix that the tenant does NOT
  // support, redirect to the tenant's default locale instead of serving
  // a page that would 404 or fall back silently. This is temporary safety
  // — M7+ Site Health surfaces missing-locale warnings to operators.
  if (hostContext.kind === "agency") {
    const firstSegment = parts[1];
    const isPlatformLocale = langSettings.publicLocales.some(
      (l) => l.toLowerCase() === firstSegment?.toLowerCase(),
    );
    if (firstSegment && isPlatformLocale) {
      const tenantLocales = await loadTenantLocaleSettings(hostContext.tenantId);
      const supportsRequested = tenantLocales.supportedLocales.some(
        (l) => l.toLowerCase() === firstSegment.toLowerCase(),
      );
      if (!supportsRequested) {
        const url = request.nextUrl.clone();
        // Drop the unsupported prefix; if the tenant's default is the platform
        // default, the `stripDefaultLocalePrefixFromPath` pass above will
        // normalize further on the next request.
        const remainder = parts.slice(2).join("/");
        url.pathname =
          tenantLocales.defaultLocale === langSettings.defaultLocale
            ? `/${remainder}`
            : `/${tenantLocales.defaultLocale}/${remainder}`;
        return NextResponse.redirect(url, 302);
      }
    }
  }

  // SaaS P2 — surface allow-list. Reject paths that do not belong on this
  // host kind BEFORE rate limits, CMS redirects, or auth run. Checked
  // against the locale-stripped path so `/es/admin` is treated as `/admin`.
  const canonicalPath = isNonDefaultLocalePrefixedPath(pathname, langSettings)
    ? stripNonDefaultLocalePrefix(pathname, langSettings)
    : pathname;

  // CMS clean-URL rewrite (agency storefronts only). Any single-segment
  // path on an agency host that is NOT in the explicit allow-list gets
  // rewritten internally to /p/{slug}. The CMS page catch-all at
  // (public)/p/[[...slug]]/page.tsx renders it with the standard
  // storefront shell (PublicHeader, footer). This gives CMS pages
  // created in the editor clean root URLs (/contact, /about, /faq)
  // without maintaining an explicit prefix entry for every slug. Paths
  // that don't correspond to a published CMS page will 404 from the
  // catch-all route, not from the middleware.
  let cmsSlugRewrite: string | null = null;
  if (
    hostContext.kind === "agency" &&
    !isPathAllowedForHostKind("agency", canonicalPath)
  ) {
    const slugMatch = canonicalPath.match(
      /^\/([a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)$/,
    );
    if (slugMatch) {
      cmsSlugRewrite = `/p/${slugMatch[1]}`;
    }
  }

  if (!cmsSlugRewrite && !isPathAllowedForHostKind(hostContext.kind, canonicalPath)) {
    return new NextResponse("Not found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  // Phase 9 v2 — share-link viewer rate limit. Token verification is
  // cheap (HMAC + a single supabase read), but a fuzzer hammering
  // `/share/<random>` 100×/sec would still consume edge cycles + DB
  // round-trips against a guaranteed-invalid token. 60 requests / minute
  // / IP is comfortably above any realistic visitor pattern (a real
  // recipient opens the link once, maybe refreshes a few times) and
  // catches drive-by scanning. Per-page asset reads load through the
  // CMS section dispatcher with their own caching so they don't re-hit
  // this gate.
  if (pathname.startsWith("/share/") && request.method === "GET") {
    if (!tryConsumeRateLimit(`share:${ip}`, 60, 60_000)) {
      return rateLimitHtmlResponse();
    }
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

  const cmsRedirect = await tryCmsRedirectResponse(
    request,
    originalPathname,
    hostContext.kind === "agency" ? hostContext.tenantId : null,
  );
  if (cmsRedirect) {
    syncLocaleCookieForPath(cmsRedirect, originalPathname, langSettings);
    return cmsRedirect;
  }

  const locale = resolveLocaleForPathname(originalPathname, request, langSettings);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(LOCALE_HEADER, locale);
  requestHeaders.set(ORIGINAL_PATHNAME_HEADER, originalPathname);

  requestHeaders.set(HOST_CONTEXT_HEADER, hostContext.kind);
  requestHeaders.set(HOST_NAME_HEADER, hostContext.hostname);

  if (hostContext.kind === "agency" || hostContext.kind === "hub") {
    // Phase 5/6 M1 — hub is also a tenant on the org abstraction (kind='hub'
    // agencies row, seeded in 20260625100000). Setting the tenant header on
    // hub requests lets the public render path call the same tenant-scoped
    // CMS reads that agency tenants use. Surface allow-list still gates
    // hub from /admin etc., so this widens data access without widening
    // the route surface.
    requestHeaders.set(TENANT_HEADER_NAME, hostContext.tenantId);
  } else {
    // Strip any spoofed header on non-tenant contexts (marketing / app).
    // Downstream code must never honour a client-supplied tenant id.
    requestHeaders.delete(TENANT_HEADER_NAME);
  }

  let pathnameForAuth = originalPathname;
  const nextUrl = request.nextUrl.clone();

  if (shouldRewriteLocalePublicPath(originalPathname, langSettings)) {
    nextUrl.pathname = stripNonDefaultLocalePrefix(originalPathname, langSettings);
    pathnameForAuth = nextUrl.pathname;
  }

  // Apply CMS clean-URL rewrite — map the slug portion to /p/{slug}
  // so Next.js routes to the CMS page catch-all. ORIGINAL_PATHNAME_HEADER
  // (set above) still contains the browser-facing URL, so EditChromeMount
  // extracts the correct page slug from the clean URL.
  if (cmsSlugRewrite) {
    nextUrl.pathname = cmsSlugRewrite;
    pathnameForAuth = cmsSlugRewrite;
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

  if (shouldRewriteLocalePublicPath(originalPathname, langSettings) || cmsSlugRewrite) {
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
