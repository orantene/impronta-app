import { NextRequest, NextResponse } from "next/server";
import type { LanguageSettings } from "@/lib/language-settings/types";
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
  HOST_TALENT_PROFILE_HEADER,
} from "@/lib/saas/host-context";
import {
  isTalentSiteHostPathAllowed,
  talentSiteHostRewritePath,
} from "@/lib/saas/talent-site-host-routing";
import { resolveCanonicalCustomDomainRedirectHost } from "@/lib/saas/domain-canonical";
import {
  PUBLIC_PATH_PREFIX_HEADER,
  TENANT_HEADER_NAME,
} from "@/lib/saas/scope";
import {
  isPathAllowedForHostKind,
  resolvePathBasedTenantPublicPath,
} from "@/lib/saas/surface-allow-list";
import { resolveLegacyTalentPlatformPath } from "@/lib/talent/legacy-talent-redirect";
import {
  loadTenantLocaleSettings,
  type TenantLocaleSettings,
} from "@/lib/site-admin/server/locale-resolver";
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

function withTenantLanguageSettings(
  base: LanguageSettings,
  tenantSettings: TenantLocaleSettings | null,
): LanguageSettings {
  if (!tenantSettings) return base;
  return {
    ...base,
    defaultLocale: tenantSettings.defaultLocale,
    publicLocales: [...tenantSettings.supportedLocales],
  };
}

/**
 * Internal host-context headers that the proxy itself sets AFTER host
 * resolution. A client must never be able to supply them: a forged
 * `x-impronta-talent-profile` would otherwise let `/_talent-site` render an
 * arbitrary talent's Max site on a host that isn't that talent's domain
 * (header-confusion / host-binding bypass), and a forged
 * `x-impronta-host-context` would defeat the route's defense-in-depth gate.
 *
 * These are stripped from the INBOUND request on EVERY path — including the
 * `/_talent-site` short-circuit's `NextResponse.next()` — so the only value
 * the app ever sees is one the proxy set on the legitimate `talent_site`
 * rewrite. Mirrors the actor-header hygiene in `lib/supabase/middleware.ts`
 * and the `TENANT_HEADER_NAME` strip below.
 */
const HOST_CONTEXT_HEADERS_TO_STRIP = [
  HOST_CONTEXT_HEADER,
  HOST_TALENT_PROFILE_HEADER,
];

function stripInboundHostContextHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers);
  for (const h of HOST_CONTEXT_HEADERS_TO_STRIP) headers.delete(h);
  return headers;
}

export async function proxy(request: NextRequest) {
  const ip = clientIp(request);
  const { pathname } = request.nextUrl;

  // Strip client-supplied host-context spoofs (x-impronta-host-context,
  // x-impronta-talent-profile) up front. The proxy is the only writer of
  // these; resetting them here means even the short-circuit's
  // `NextResponse.next()` forwards a request the client could not have forged.
  const sanitizedInboundHeaders = stripInboundHostContextHeaders(request);

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
    // Legacy webhook alias — /api/webhooks/stripe delegates to the same
    // unified handler as /api/stripe/webhook. Whichever URL Stripe is pointed
    // at must reach the handler regardless of Host, so it needs the same
    // host-gating bypass; otherwise this path rewrites to the unregistered-host
    // page and the webhook silently 404s.
    pathname.startsWith("/api/webhooks/") ||
    // Supabase auth "Send Email" hook → /api/hooks/auth-email. Supabase POSTs
    // server-to-server with whatever Host it resolves; the route has its own
    // Standard-Webhooks signature auth, so it must bypass tenant host-gating
    // (otherwise it rewrites to the not-found page and auth mail silently fails).
    pathname.startsWith("/api/hooks/") ||
    pathname.startsWith("/api/cron/") ||
    pathname === "/api/analytics/events" ||
    // Branded 404 page for unregistered hosts — must bypass host gating to
    // avoid infinite rewrite loops when the middleware rewrites here.
    pathname === "/_host-unregistered" ||
    // Branded "page not found" page for known-host disallowed paths — same
    // recursion-avoidance rationale as /_host-unregistered above.
    pathname === "/_page-not-found" ||
    // Talent custom-domain host route — internal rewrite target for a
    // `kind: "talent_site"` host. Whitelisted so the rewrite below does not
    // recurse back through host resolution. The route reads the resolved
    // talent_profile_id from the host header set by the talent_site block.
    pathname === "/_talent-site" ||
    pathname.startsWith("/_talent-site/") ||
    // Dev sign-in shortcut — host-resolution bypass.
    //   - NODE_ENV=development: local `npm run dev`, allowed unconditionally
    //   - VERCEL_ENV=preview: Vercel preview deploys, allowed because previews
    //     are themselves SSO-gated by the Vercel team-auth wall — anonymous
    //     visitors hit a 401 long before reaching this middleware. Lets
    //     agents + manual QA hit /api/dev/signin on staging-funnel previews
    //     without needing the full Supabase auth flow.
    //   - VERCEL_ENV=production: NOT allowed; the route handler additionally
    //     refuses to serve in production as defense-in-depth.
    ((process.env.NODE_ENV === "development" ||
      process.env.VERCEL_ENV === "preview") &&
      pathname.startsWith("/api/dev/")) ||
    // Dev UI routes — /dev/template-preview/[key] and /dev/section-sandbox/[type].
    // Mirroring the /api/dev/ bypass above: reachable in dev and preview only.
    // The surface allow-list would otherwise 404 these paths because /dev/ is
    // not in any host-kind allow-list. Production is intentionally excluded so
    // these QA surfaces are never reachable on tulala.digital.
    ((process.env.NODE_ENV === "development" ||
      process.env.VERCEL_ENV === "preview") &&
      pathname.startsWith("/dev/"))
  ) {
    // Forward the sanitized headers so the `/_talent-site` short-circuit can
    // NEVER carry a client-forged `x-impronta-talent-profile` /
    // `x-impronta-host-context` into the route.
    return NextResponse.next({ request: { headers: sanitizedInboundHeaders } });
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

  // ── Talent custom-domain host ────────────────────────────────────────────
  // A `kind: "talent_site"` host (resolved only AFTER agency_domains misses)
  // serves the talent's published Max site. Its surface is intentionally tiny:
  // the site home (`/`) and inner page slugs (`/<slug>`), plus shared plumbing.
  // Anything else 404s — a vanity domain never exposes the workspace, directory,
  // or auth. The render path reads the talent_profile_id from a host header set
  // here, so a client can never spoof it.
  if (hostContext.kind === "talent_site") {
    const talentLangSettings = await getLanguageSettingsForMiddleware();
    const localeStripped = isNonDefaultLocalePrefixedPath(pathname, talentLangSettings)
      ? stripNonDefaultLocalePrefix(pathname, talentLangSettings)
      : stripDefaultLocalePrefixFromPath(pathname, talentLangSettings);

    const decision = isTalentSiteHostPathAllowed(localeStripped);
    if (!decision) {
      return NextResponse.rewrite(
        new URL("/_page-not-found", request.url),
        { status: 404 },
      );
    }

    const talentHeaders = new Headers(sanitizedInboundHeaders);
    const locale = resolveLocaleForPathname(pathname, request, talentLangSettings);
    talentHeaders.set(LOCALE_HEADER, locale);
    talentHeaders.set(ORIGINAL_PATHNAME_HEADER, request.nextUrl.pathname);
    talentHeaders.set(HOST_CONTEXT_HEADER, "talent_site");
    talentHeaders.set(HOST_NAME_HEADER, hostContext.hostname);
    talentHeaders.set(HOST_TALENT_PROFILE_HEADER, hostContext.talentProfileId);
    // A talent_site host is NOT tenant-scoped — never let a tenant id leak.
    talentHeaders.delete(TENANT_HEADER_NAME);
    talentHeaders.delete(HOST_TENANT_SLUG_HEADER);
    talentHeaders.delete(PUBLIC_PATH_PREFIX_HEADER);

    if (decision.kind === "passthrough") {
      return NextResponse.next({ request: { headers: talentHeaders } });
    }

    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = talentSiteHostRewritePath(decision.pageSlug);
    const res = NextResponse.rewrite(rewriteUrl, {
      request: { headers: talentHeaders },
    });
    syncLocaleCookieForPath(res, request.nextUrl.pathname, talentLangSettings, request);
    return res;
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
  const hostTenantLocaleSettings = isTenantHostContext(hostContext)
    ? await loadTenantLocaleSettings(hostContext.tenantId)
    : null;
  const hostLangSettings = withTenantLanguageSettings(
    langSettings,
    hostTenantLocaleSettings,
  );

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

  const withoutLocalePrefix = stripDefaultLocalePrefixFromPath(pathname, hostLangSettings);
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
    syncLocaleCookieForPath(res, pathname, hostLangSettings, request);
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
      const tenantLocales =
        hostTenantLocaleSettings ?? await loadTenantLocaleSettings(hostContext.tenantId);
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
  const canonicalPath = isNonDefaultLocalePrefixedPath(pathname, hostLangSettings)
    ? stripNonDefaultLocalePrefix(pathname, hostLangSettings)
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
  const effectiveTenantLocaleSettings =
    pathBasedTenantContext && isTenantHostContext(pathBasedTenantContext)
      ? await loadTenantLocaleSettings(pathBasedTenantContext.tenantId)
      : hostTenantLocaleSettings;
  const effectiveLangSettings = withTenantLanguageSettings(
    langSettings,
    effectiveTenantLocaleSettings,
  );
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
      // `talent_site` is fully handled + early-returned above, so this is dead
      // in practice; the guard keeps the allow-list call to the four
      // tenant-surface host kinds and 404s defensively if it ever reaches here.
      effectiveHostContext.kind === "talent_site" ||
      !isPathAllowedForHostKind(effectiveHostContext.kind, effectiveCanonicalPath)
    )
  ) {
    // Render the branded "page not found" page (Tulala chrome + a way home)
    // instead of bare plain-text — a mistyped or stale URL on a known host must
    // never be a chrome-less dead end. The rewrite target is whitelisted in the
    // short-circuit block above so this does not recurse.
    return NextResponse.rewrite(
      new URL("/_page-not-found", request.url),
      { status: 404 },
    );
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

  // Phase 2.1 — legacy /{tenantSlug}/talent/* → platform /talent/* (HTTP redirect).
  if (request.method === "GET" || request.method === "HEAD") {
    const legacyTalentTarget = resolveLegacyTalentPlatformPath(originalPathname);
    if (legacyTalentTarget) {
      const url = request.nextUrl.clone();
      url.pathname = legacyTalentTarget;
      return NextResponse.redirect(url, 308);
    }
  }

  if (isNonDefaultLocalePrefixedPath(originalPathname, effectiveLangSettings)) {
    const inner = stripNonDefaultLocalePrefix(originalPathname, effectiveLangSettings);
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
    syncLocaleCookieForPath(cmsRedirect, originalPathname, effectiveLangSettings, request);
    return cmsRedirect;
  }

  // QA 2026-05-13 — locale resolution must use the ORIGINAL pathname, not
  // the canonicalized one. `effectiveCanonicalPath` has had the locale prefix
  // stripped (line 266) for tenant-slug matching, so passing it here would
  // turn `/es/impronta` into `/impronta` and `resolveLocaleForPathname` would
  // return the default locale instead of `es`. Result: the page renders in
  // EN even when the URL is `/es/...`, and the operator-facing locale
  // switcher appears non-functional.
  const locale = resolveLocaleForPathname(pathname, request, effectiveLangSettings);
  // Built from the sanitized clone — a forged x-impronta-talent-profile /
  // x-impronta-host-context can never reach the app on non-talent-site hosts.
  const requestHeaders = new Headers(sanitizedInboundHeaders);
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

  if (shouldRewriteLocalePublicPath(originalPathname, effectiveLangSettings)) {
    nextUrl.pathname = stripNonDefaultLocalePrefix(originalPathname, effectiveLangSettings);
    pathnameForAuth = nextUrl.pathname;
  }

  let pathBasedTenantRewrite = false;
  if (pathBasedTenantContext && pathBasedTenant) {
    nextUrl.pathname = pathBasedTenant.pathnameWithoutTenant;
    pathnameForAuth = nextUrl.pathname;
    pathBasedTenantRewrite = true;
  }

  // Marketing apex global directory. The agency storefront owns the literal
  // `(public)/directory` route (its own commerce shell: favorites, inquiry
  // sheet, cart), so the platform-wide cross-tenant directory lives in the
  // marketing route group at `/global-directory` — it must inherit
  // MarketingShell, NOT the storefront chrome. Two route groups cannot both
  // resolve `/directory`, so on marketing hosts we internally rewrite the
  // canonical `/directory` URL to `/global-directory`. The browser URL stays
  // `/directory`; `/global-directory` is intentionally absent from the
  // marketing allow-list, so it is reachable only through this rewrite.
  let marketingDirectoryRewrite = false;
  if (effectiveHostContext.kind === "marketing" && pathnameForAuth === "/directory") {
    nextUrl.pathname = "/global-directory";
    pathnameForAuth = "/global-directory";
    marketingDirectoryRewrite = true;
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
  // Keep the branded URL (`/admin`, `/client`) but route through the
  // canonical slug handlers (`/<slug>/admin`, etc.) via internal rewrite,
  // because those surfaces have no standalone (non-slug) route tree.
  //
  // `/talent/*` is DELIBERATELY EXCLUDED from this rewrite. The talent
  // self-surface has its own standalone, host-agnostic tree at
  // `app/(workspace)/talent/*` that resolves the talent's active agency
  // from session + cookie, so it renders correctly on ANY host without a
  // slug prefix (the app host already serves it this way). The tenant-
  // scoped `app/(workspace)/[tenantSlug]/talent/*` pages, by contrast, are
  // all *legacy redirectors* that `redirect()` straight back to `/talent/*`.
  // So rewriting `/talent/foo` → `/<slug>/talent/foo` lands on a redirector
  // that bounces back to `/talent/foo`, which this middleware rewrites
  // again — an infinite client-side navigation loop where every hop is an
  // HTTP 200 carrying a NEXT_REDIRECT directive to the same URL (the page
  // never settles, the heading never renders). This bit every canonical
  // platform-talent route — /talent/trust, /talent/discover,
  // /talent/settings/payouts — on agency custom domains. Letting `/talent/*`
  // fall through to its own tree is both correct and identical to how the
  // app host serves it.
  //
  // `/client/register` still needs the bypass below: it is an
  // unauthenticated (auth)-route page, and rewriting it to
  // `/<slug>/client/register` would hit a non-existent workspace path → 404,
  // breaking the client-acquisition funnel on the tenant's own host.
  const isRegistrationEntry = pathnameForAuth === "/client/register";
  if (
    hostContext.kind === "agency" &&
    hostContext.tenantSlug &&
    !isRegistrationEntry &&
    !pathnameForAuth.startsWith(`/${hostContext.tenantSlug}/`) &&
    (
      pathnameForAuth === "/admin" ||
      pathnameForAuth.startsWith("/admin/") ||
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
    languageSettings: effectiveLangSettings,
  });

  if (sessionRes.headers.get("location")) {
    syncLocaleCookieForPath(sessionRes, originalPathname, effectiveLangSettings, request);
    return sessionRes;
  }

  if (
    shouldRewriteLocalePublicPath(originalPathname, effectiveLangSettings) ||
    pathBasedTenantRewrite ||
    cmsSlugRewrite ||
    brandedWorkspaceShortcutRewrite ||
    marketingDirectoryRewrite
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

    syncLocaleCookieForPath(res, originalPathname, effectiveLangSettings, request);
    return res;
  }

  syncLocaleCookieForPath(sessionRes, originalPathname, effectiveLangSettings, request);
  return sessionRes;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
