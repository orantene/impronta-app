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
  resolveTenantContextFromPathSlug,
  type HostContext,
  HOST_CONTEXT_HEADER,
  HOST_NAME_HEADER,
  HOST_TENANT_SLUG_HEADER,
} from "@/lib/saas/host-context";
import { resolveCanonicalCustomDomainRedirectHost } from "@/lib/saas/domain-canonical";
import {
  PUBLIC_PATH_PREFIX_HEADER,
  TENANT_HEADER_NAME,
} from "@/lib/saas/scope";
import {
  isPathAllowedForHostKind,
  resolvePathBasedTenantPublicPath,
} from "@/lib/saas/surface-allow-list";
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

function isTenantHostContext(
  context: HostContext,
): context is Extract<HostContext, { kind: "agency" | "hub" }> {
  return context.kind === "agency" || context.kind === "hub";
}

function isLocalhostHost(hostHeader: string): boolean {
  const hostname = hostHeader.split(":")[0]?.trim().toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export async function proxy(request: NextRequest) {
  const ip = clientIp(request);
  const { pathname } = request.nextUrl;

  // ── Shared-API short-circuit (audit C2) ──────────────────────────────────
  // The Stripe webhook + cron + analytics-events endpoints must reach their
  // route handlers regardless of host. Stripe sends webhooks to the public
  // endpoint we register; the originating Host header is whatever Stripe
  // resolves and may not match any seeded `agency_domains` row, especially
  // if we ever point Stripe at a `*.vercel.app` preview. Each of these
  // endpoints has its own auth (signature, bearer token, allow-list) so
  // tenant-host gating is unnecessary and actively harmful here.
  //
  // Also short-circuit the branded unregistered-host page itself so the
  // internal rewrite below doesn't recurse back through host resolution.
  if (
    pathname.startsWith("/api/stripe/") ||
    pathname.startsWith("/api/cron/") ||
    pathname === "/api/analytics/events" ||
    // Branded 404 page for unregistered hosts — must bypass host gating to
    // avoid infinite rewrite loops when the middleware rewrites here.
    pathname === "/_host-unregistered" ||
    // Dev-only sign-in shortcut — blocked by the route handler in production
    (process.env.NODE_ENV === "development" && pathname.startsWith("/api/dev/"))
  ) {
    return NextResponse.next();
  }

  // SaaS Phase 4 — unified host resolution. Every hostname (marketing /
  // app / hub / agency) is resolved via a single DB-driven lookup in
  // `agency_domains`. No hostnames are hardcoded in code. Downstream
  // server code reads the resulting context from request headers.
  const hostHeader = request.headers.get("host") ?? "";

  // Canonical apex redirect. Vercel's own domain-level redirect for the
  // www → apex redirect can't be configured while the apex is ghost-attached
  // to a deleted Vercel project (see project memory). Handle it here so SEO
  // stays consistent regardless of which host the request lands on.
  // Audit H11 — only redirect safe (idempotent) methods. POST/PUT/DELETE/PATCH
  // would lose their body on a 308 with some clients; reject explicitly.
  if (hostHeader.toLowerCase() === TULALA_WWW_HOST) {
    if (request.method === "GET" || request.method === "HEAD") {
      const target = new URL(request.url);
      target.hostname = TULALA_APEX_HOST;
      target.port = "";
      return NextResponse.redirect(target, 308);
    }
    return new NextResponse("Misdirected request: use the apex host for this method.", {
      status: 421,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const hostContext = await resolveTenantContext(request, hostHeader);

  if (hostContext.kind === "not_found") {
    // Fail-hard (Plan L37): an unregistered hostname does NOT fall back
    // to tenant #1 or the hub. A 404 tells the operator the domain needs
    // seeding in `agency_domains`.
    //
    // Rewrite to the branded 404 page instead of returning plain text.
    // The rewrite target `/_host-unregistered` is whitelisted in the
    // short-circuit block above so this does not recurse.
    return NextResponse.rewrite(
      new URL("/_host-unregistered", request.url),
      { status: 404 },
    );
  }

  if (
    hostContext.kind === "agency" &&
    (request.method === "GET" || request.method === "HEAD")
  ) {
    const canonicalHost = resolveCanonicalCustomDomainRedirectHost({
      currentHost: hostContext.hostname,
      domainKind: hostContext.domainKind,
      isPrimary: hostContext.isPrimary,
      canonicalHost: hostContext.canonicalHost,
      canonicalHostKind: hostContext.canonicalHostKind,
    });

    if (canonicalHost) {
      const target = new URL(request.url);
      target.hostname = canonicalHost;
      return NextResponse.redirect(target, 308);
    }
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
    // Audit H11 — locale-canonicalization redirect: only safe methods.
    if (canonical && parts[1] !== canonical && (request.method === "GET" || request.method === "HEAD")) {
      parts[1] = canonical;
      const url = request.nextUrl.clone();
      url.pathname = parts.join("/") || "/";
      return NextResponse.redirect(url, 308);
    }
  }

  const withoutLocalePrefix = stripDefaultLocalePrefixFromPath(pathname, langSettings);
  // Audit H11 — locale-strip redirect: only safe methods.
  if (
    withoutLocalePrefix !== pathname &&
    (request.method === "GET" || request.method === "HEAD")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = withoutLocalePrefix;
    const res = NextResponse.redirect(url, 308);
    // QA 2026-05-13 — without setting the locale cookie here, the
    // redirected page renders in the DEFAULT locale even though the
    // operator's URL was `/es/<tenant>`. The downstream
    // `syncLocaleCookieForPath` calls only fire after this early-return,
    // so they never see the original `/es/` prefix and never set the
    // cookie. Result: clicking the ES locale switcher pushed
    // `/es/impronta?edit=1` → server 308'd to `/impronta?edit=1` →
    // page rendered in EN. The switcher appeared broken.
    //
    // Set the cookie on the redirect response so the followed URL
    // serves with the right locale.
    syncLocaleCookieForPath(res, pathname, langSettings, request);
    return res;
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

  const canResolvePathBasedTenant =
    hostContext.kind === "hub" ||
    hostContext.kind === "marketing" ||
    (hostContext.kind === "app" && isLocalhostHost(hostHeader));
  const pathBasedTenant = canResolvePathBasedTenant
    ? resolvePathBasedTenantPublicPath(canonicalPath)
    : null;
  const pathBasedTenantContext = pathBasedTenant
    ? await resolveTenantContextFromPathSlug(
        request,
        hostHeader,
        pathBasedTenant.tenantSlug,
      )
    : null;
  const effectiveHostContext = pathBasedTenantContext ?? hostContext;
  const effectiveCanonicalPath =
    pathBasedTenantContext && pathBasedTenant
      ? pathBasedTenant.pathnameWithoutTenant
      : canonicalPath;

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
    effectiveHostContext.kind === "agency" &&
    !isPathAllowedForHostKind("agency", effectiveCanonicalPath)
  ) {
    const slugMatch = effectiveCanonicalPath.match(
      /^\/([a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)$/,
    );
    if (slugMatch) {
      cmsSlugRewrite = `/p/${slugMatch[1]}`;
    }
  }

  if (
    !cmsSlugRewrite &&
    (
      effectiveHostContext.kind === "not_found" ||
      !isPathAllowedForHostKind(effectiveHostContext.kind, effectiveCanonicalPath)
    )
  ) {
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
    pathBasedTenantContext && pathBasedTenant
      ? pathBasedTenant.pathnameWithoutTenant
      : originalPathname,
    effectiveHostContext.kind === "agency" ? effectiveHostContext.tenantId : null,
  );
  if (cmsRedirect) {
    syncLocaleCookieForPath(cmsRedirect, originalPathname, langSettings, request);
    return cmsRedirect;
  }

  const locale = resolveLocaleForPathname(effectiveCanonicalPath, request, langSettings);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(LOCALE_HEADER, locale);
  requestHeaders.set(ORIGINAL_PATHNAME_HEADER, originalPathname);

  requestHeaders.set(HOST_CONTEXT_HEADER, effectiveHostContext.kind);
  requestHeaders.set(HOST_NAME_HEADER, effectiveHostContext.hostname);

  if (isTenantHostContext(effectiveHostContext)) {
    // Phase 5/6 M1 — hub is also a tenant on the org abstraction (kind='hub'
    // agencies row, seeded in 20260625100000). Setting the tenant header on
    // hub requests lets the public render path call the same tenant-scoped
    // CMS reads that agency tenants use. Surface allow-list still gates
    // hub from /admin etc., so this widens data access without widening
    // the route surface.
    requestHeaders.set(TENANT_HEADER_NAME, effectiveHostContext.tenantId);
  } else {
    // Strip any spoofed header on non-tenant contexts (marketing / app).
    // Downstream code must never honour a client-supplied tenant id.
    requestHeaders.delete(TENANT_HEADER_NAME);
  }

  // Phase 4 — propagate tenant slug for agency hosts.
  // Used by layouts for branded-shortcut redirect (/admin → /<slug>/admin)
  // without an extra DB roundtrip. Only set for agency kind; cleared otherwise.
  if (effectiveHostContext.kind === "agency" && effectiveHostContext.tenantSlug) {
    requestHeaders.set(HOST_TENANT_SLUG_HEADER, effectiveHostContext.tenantSlug);
  } else {
    requestHeaders.delete(HOST_TENANT_SLUG_HEADER);
  }

  if (effectiveHostContext.kind === "agency" && effectiveHostContext.domainKind === "path") {
    requestHeaders.set(PUBLIC_PATH_PREFIX_HEADER, `/${effectiveHostContext.tenantSlug}`);
  } else {
    requestHeaders.delete(PUBLIC_PATH_PREFIX_HEADER);
  }

  let pathnameForAuth = originalPathname;
  const nextUrl = request.nextUrl.clone();
  let brandedWorkspaceShortcutRewrite = false;

  if (shouldRewriteLocalePublicPath(originalPathname, langSettings)) {
    nextUrl.pathname = stripNonDefaultLocalePrefix(originalPathname, langSettings);
    pathnameForAuth = nextUrl.pathname;
  }

  let pathBasedTenantRewrite = false;
  if (pathBasedTenantContext && pathBasedTenant) {
    nextUrl.pathname = pathBasedTenant.pathnameWithoutTenant;
    pathnameForAuth = nextUrl.pathname;
    pathBasedTenantRewrite = true;
  }

  // Apply CMS clean-URL rewrite — map the slug portion to /p/{slug}
  // so Next.js routes to the CMS page catch-all. ORIGINAL_PATHNAME_HEADER
  // (set above) still contains the browser-facing URL, so EditChromeMount
  // extracts the correct page slug from the clean URL.
  if (cmsSlugRewrite) {
    nextUrl.pathname = cmsSlugRewrite;
    pathnameForAuth = cmsSlugRewrite;
  }

  // Phase 3.12 / 3.13 — branded workspace shortcuts on agency hosts.
  // Keep the branded URL (`/admin`, `/talent`, `/client`) but route through
  // the canonical slug handlers (`/<slug>/admin`, etc.) via internal rewrite.
  if (
    hostContext.kind === "agency" &&
    hostContext.tenantSlug &&
    !pathnameForAuth.startsWith(`/${hostContext.tenantSlug}/`) &&
    (
      pathnameForAuth === "/admin" ||
      pathnameForAuth.startsWith("/admin/") ||
      pathnameForAuth === "/talent" ||
      pathnameForAuth.startsWith("/talent/") ||
      pathnameForAuth === "/client" ||
      pathnameForAuth.startsWith("/client/")
    )
  ) {
    nextUrl.pathname = `/${hostContext.tenantSlug}${pathnameForAuth}`;
    pathnameForAuth = nextUrl.pathname;
    brandedWorkspaceShortcutRewrite = true;
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
    syncLocaleCookieForPath(sessionRes, originalPathname, langSettings, request);
    return sessionRes;
  }

  if (
    shouldRewriteLocalePublicPath(originalPathname, langSettings) ||
    pathBasedTenantRewrite ||
    cmsSlugRewrite ||
    brandedWorkspaceShortcutRewrite
  ) {
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

    syncLocaleCookieForPath(res, originalPathname, langSettings, request);
    return res;
  }

  syncLocaleCookieForPath(sessionRes, originalPathname, langSettings, request);
  return sessionRes;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
