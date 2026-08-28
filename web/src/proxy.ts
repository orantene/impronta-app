import { NextRequest, NextResponse } from "next/server";
import { stripDefaultLocalePrefixFromPath } from "@/i18n/pathnames";
import { pinnedMarketingLocale } from "@/lib/seo/spanish-named-routes";
import {
  isDashboardInnerPathForLocalePrefix,
  isNonDefaultLocalePrefixedPath,
  resolveLocaleForPathname,
  shouldRewriteLocalePublicPath,
  stripNonDefaultLocalePrefix,
  syncLocaleCookieForPath,
} from "@/i18n/locale-middleware";
import { LOCALE_HEADER, ORIGINAL_PATHNAME_HEADER, ORIGINAL_SEARCH_HEADER } from "@/i18n/request-locale";
import { getLanguageSettingsForMiddleware } from "@/lib/language-settings/middleware-locale-cache";
import { tryCmsRedirectResponse } from "@/lib/cms/middleware-redirect";
import { cleanPublicUrlRedirectResponse, resolveCleanUrlRewrite } from "@/lib/cms/clean-url-middleware";
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
  HOST_TENANT_SLUG_HEADER,
  HOST_TALENT_PROFILE_HEADER,
} from "@/lib/saas/host-context";
import { offRosterTalentResponse } from "@/lib/saas/off-roster-talent-gate";
import { isTalentSiteHostPathAllowed, talentSiteHostRewritePath } from "@/lib/saas/talent-site-host-routing";
import { resolveCanonicalCustomDomainRedirectHost } from "@/lib/saas/domain-canonical";
import {
  brandedAdminRedirectPath,
  brandedAdminRewritePath,
  normalizeBrandedNextParam,
} from "@/lib/saas/branded-admin-url";
import {
  PUBLIC_PATH_PREFIX_HEADER,
  TENANT_HEADER_NAME,
} from "@/lib/saas/scope";
import {
  isPathAllowedForHostKind,
  resolveWorkspacePathTenantPublicPath,
  WORKSPACE_PATH_SEGMENT,
} from "@/lib/saas/surface-allow-list";
import {
  marketingWorkspacePathRedirect,
  workspacePathRedirect,
} from "@/lib/saas/workspace-path-redirects";
import { resolveLegacyTalentPlatformPath } from "@/lib/talent/legacy-talent-redirect";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";
import {
  isTenantHostContext,
  resolveProxyLocaleContext,
} from "@/lib/saas/proxy-locale-context";
import {
  PREVIEW_COOKIE_OPTIONS,
  PREVIEW_QUERY_PARAM,
  previewCookieNameFor,
} from "@/lib/site-admin/preview/cookie";
import { readPreviewFromQueryParam } from "@/lib/site-admin/preview/middleware";
import { ensureExperimentVisitorCookie } from "@/lib/site-admin/builder-node/experiment-visitor-cookie";
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
  // Stripe webhook + cron + analytics-events must reach their route handlers
  // regardless of host: the inbound Host header may match no seeded
  // `agency_domains` row. Each has its own auth (signature, bearer, allow-list)
  // so tenant-host gating is unnecessary and actively harmful here. Also
  // short-circuits the branded unregistered-host page so the rewrite below
  // doesn't recurse through host resolution.
  if (
    pathname.startsWith("/api/stripe/") ||
    // Legacy webhook alias — /api/webhooks/stripe delegates to the same
    // unified handler as /api/stripe/webhook. Whichever URL Stripe is pointed
    // at must reach the handler regardless of Host, so it needs the same
    // host-gating bypass; otherwise this path rewrites to the unregistered-host
    // page and the webhook silently 404s.
    pathname.startsWith("/api/webhooks/") ||
    // Client Pro subscription webhook (Phase D). Stripe POSTs here with its own
    // signature auth, so it must bypass tenant host-gating like the other Stripe
    // endpoints — otherwise it rewrites to the not-found page and silently 404s.
    pathname === "/api/discover/subscriptions/webhook" ||
    // Supabase auth "Send Email" hook → /api/hooks/auth-email. Supabase POSTs
    // server-to-server with whatever Host it resolves; the route has its own
    // Standard-Webhooks signature auth, so it must bypass tenant host-gating
    // (otherwise it rewrites to the not-found page and auth mail silently fails).
    pathname.startsWith("/api/hooks/") ||
    pathname.startsWith("/api/cron/") ||
    pathname === "/api/analytics/events" ||
    // Public CMS form submission (cross-domain storefront contact/lead POST). Has
    // its own defenses + derives tenant from the section row, not Host; must bypass
    // host gating or the rewrite below 500s every submission.
    pathname.startsWith("/api/cms/forms/") ||
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
    // Dev sign-in shortcut — bypass in dev + preview only (previews are SSO-gated
    // by Vercel team-auth; production is excluded here AND in the route handler as
    // defense-in-depth).
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
    // Fail-hard (Plan L37): an unregistered hostname does NOT fall back to
    // tenant #1 or the hub — a 404 tells the operator the domain needs seeding
    // in `agency_domains`. Rewrite to the branded 404 page rather than plain
    // text; `/_host-unregistered` is whitelisted above so this cannot recurse.
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
    const off = await offRosterTalentResponse(request, pathname, hostContext.tenantId, PREVIEW_QUERY_PARAM);
    if (off) return off;
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

  // Which tenant's URL grammar governs this request. MUST run before the
  // default-locale strip, the supported-locale enforcement and the allow-list
  // canonicalization below: on `/w/<slug>/…` the grammar belongs to the PATH
  // tenant, not the host tenant. See proxy-locale-context.ts.
  const {
    canResolvePathBasedTenant,
    pathBasedTenantContext,
    effectiveHostContext,
    effectiveTenantLocaleSettings,
    effectiveLangSettings,
  } = await resolveProxyLocaleContext({
    request,
    hostHeader,
    pathname,
    hostContext,
    hostTenantLocaleSettings,
    langSettings,
  });

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

  const withoutLocalePrefix = stripDefaultLocalePrefixFromPath(
    pathname,
    effectiveLangSettings,
  );
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
    syncLocaleCookieForPath(res, pathname, effectiveLangSettings, request);
    return res;
  }

  // Phase 5 / M1 — per-tenant locale enforcement. A tenant publishes a subset
  // of platform locales (`agency_business_identity.supported_locales`). When
  // the URL carries an explicit locale prefix that the tenant does NOT
  // support, redirect to the tenant's default locale instead of serving
  // a page that would 404 or fall back silently. This is temporary safety
  // — M7+ Site Health surfaces missing-locale warnings to operators.
  //
  // 2026-08-16 — this was gated on `hostContext.kind === "agency"`, so hub
  // tenants AND every path-based `/w/<slug>` tenant got NO enforcement at all:
  // an unsupported `/fr/w/<slug>` fell through to the surface allow-list and
  // 404'd instead of redirecting to the tenant's own default locale. Gate on the
  // EFFECTIVE tenant context instead (`agency` or `hub`, host- or path-resolved).
  // Non-tenant contexts (marketing / app) still skip it, exactly as before.
  if (isTenantHostContext(effectiveHostContext) && effectiveTenantLocaleSettings) {
    const firstSegment = parts[1];
    const isPlatformLocale = langSettings.publicLocales.some(
      (l) => l.toLowerCase() === firstSegment?.toLowerCase(),
    );
    if (firstSegment && isPlatformLocale) {
      const tenantLocales = effectiveTenantLocaleSettings;
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

  // SaaS P2 — surface allow-list. Reject paths that do not belong on this host
  // kind BEFORE rate limits, CMS redirects, or auth run. Checked against the
  // locale-stripped path so `/es/admin` is treated as `/admin`.
  const canonicalPath = isNonDefaultLocalePrefixedPath(pathname, effectiveLangSettings)
    ? stripNonDefaultLocalePrefix(pathname, effectiveLangSettings)
    : pathname;

  // `/w` parent + legacy-flat 301s — see workspace-path-redirects.ts.
  const workspaceRedirect = canResolvePathBasedTenant
    ? await workspacePathRedirect({ request, pathname, canonicalPath, hostHeader })
    : null;
  if (workspaceRedirect) return workspaceRedirect;

  // Marketing-host bookmarks of /{slug}/admin (and other workspace surfaces)
  // must land on the app origin — the allow-list below would otherwise 404.
  const marketingWorkspaceRedirect = await marketingWorkspacePathRedirect({
    request,
    pathname,
    canonicalPath,
    hostHeader,
    hostKind: effectiveHostContext.kind,
  });
  if (marketingWorkspaceRedirect) return marketingWorkspaceRedirect;

  // Re-derived from `canonicalPath` (not from the locale-agnostic probe above)
  // because `pathnameWithoutTenant` is what actually gets rewritten, and it must
  // carry the grammar-correct remainder. The probe already told us WHICH tenant;
  // this tells us WHAT path within it.
  const pathBasedTenant = pathBasedTenantContext
    ? resolveWorkspacePathTenantPublicPath(canonicalPath)
    : null;
  const effectiveCanonicalPath =
    pathBasedTenantContext && pathBasedTenant
      ? pathBasedTenant.pathnameWithoutTenant
      : canonicalPath;

  // Clean public URLs: a tenant path the platform does not own is a page slug,
  // rewritten INTERNALLY to /p/<slug> for the (public)/p/[[...slug]] catch-all.
  // Serves `/about` on custom domains and tenant subdomains, and
  // `/w/<tenantSlug>/about` on path hosts (a path tenant resolves to an
  // `agency` context and effectiveCanonicalPath is already tenant-relative).
  // Grammar in cms/clean-urls.ts; unpublished slugs 404 from the page.
  const cmsSlugRewrite = resolveCleanUrlRewrite(effectiveHostContext.kind, effectiveCanonicalPath);

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
  // A1: isTenantSlugCandidate doesn't know locale codes, so skip below when "es" would be misread as a legacy tenant slug.
  const originalHasLocalePrefix = isNonDefaultLocalePrefixedPath(originalPathname, effectiveLangSettings);
  // Phase 2.1 — legacy /{tenantSlug}/talent/* → platform /talent/*.
  if ((request.method === "GET" || request.method === "HEAD") && !originalHasLocalePrefix) {
    const legacyTalentTarget = resolveLegacyTalentPlatformPath(originalPathname);
    if (legacyTalentTarget) {
      const url = request.nextUrl.clone();
      url.pathname = legacyTalentTarget;
      return NextResponse.redirect(url, 308);
    }
  }

  if (originalHasLocalePrefix) {
    const inner = stripNonDefaultLocalePrefix(originalPathname, effectiveLangSettings);
    if (isDashboardInnerPathForLocalePrefix(inner)) { // A1: carves out /talent|client/register
      const url = request.nextUrl.clone();
      url.pathname = inner;
      return NextResponse.redirect(url, 308);
    }
  }

  // Branded-host slug canonicalization — inverse of the shortcut rewrite below.
  // That rewrite makes `/admin` WORK on a tenant's own host; this makes it the
  // ONLY URL, so bookmarks and legacy `/<slug>/admin` hrefs stop landing users
  // on `improntamodels.com/impronta/admin`. `domainKind !== "path"` spares
  // `/w/<slug>` tenants, whose prefix is load-bearing. See branded-admin-url.ts.
  if (
    (request.method === "GET" || request.method === "HEAD") &&
    hostContext.kind === "agency" &&
    hostContext.domainKind !== "path"
  ) {
    const branded = brandedAdminRedirectPath(originalPathname, hostContext.tenantSlug);
    if (branded) {
      const url = request.nextUrl.clone();
      url.pathname = branded;
      return NextResponse.redirect(url, 308);
    }
  }

  const cmsRedirect = await tryCmsRedirectResponse(
    request,
    pathBasedTenantContext && pathBasedTenant
      ? pathBasedTenant.pathnameWithoutTenant
      : originalPathname,
    effectiveHostContext.kind === "agency" ? effectiveHostContext.tenantId : null,
    effectiveLangSettings.publicLocales,
  );
  if (cmsRedirect) {
    syncLocaleCookieForPath(cmsRedirect, originalPathname, effectiveLangSettings, request);
    return cmsRedirect;
  }

  // Legacy `/p/<slug>` → clean `/<slug>`, permanent. AFTER the tenant redirect
  // table so an operator keeps precedence. Locale and `/w/<tenantSlug>`
  // prefixes survive the hop; grammar in cms/clean-urls.ts.
  const cleanUrlRedirect = cleanPublicUrlRedirectResponse({
    request, hostKind: effectiveHostContext.kind, pathname: originalPathname, languageSettings: effectiveLangSettings,
  });
  if (cleanUrlRedirect) return cleanUrlRedirect;

  // QA 2026-05-13 — locale resolution must use the ORIGINAL pathname, not
  // the canonicalized one. `effectiveCanonicalPath` has had the locale prefix
  // stripped (line 266) for tenant-slug matching, so passing it here would
  // turn `/es/impronta` into `/impronta` and `resolveLocaleForPathname` would
  // return the default locale instead of `es`. Result: the page renders in
  // EN even when the URL is `/es/...`, and the operator-facing locale
  // switcher appears non-functional.
  // Spanish-NAMED routes pin to `es` — see spanish-named-routes.ts for why.
  const locale = pinnedMarketingLocale(effectiveHostContext.kind, pathname)
    ?? resolveLocaleForPathname(pathname, request, effectiveLangSettings);
  // Built from the sanitized clone — a forged x-impronta-talent-profile /
  // x-impronta-host-context can never reach the app on non-talent-site hosts.
  const requestHeaders = new Headers(sanitizedInboundHeaders);
  requestHeaders.set(LOCALE_HEADER, locale);
  requestHeaders.set(ORIGINAL_PATHNAME_HEADER, originalPathname);
  // Query string for server components Next never hands `searchParams` to (CMS sections). See getRequestSearchParams().
  requestHeaders.set(ORIGINAL_SEARCH_HEADER, request.nextUrl.search);

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

  // Phase 4 — propagate tenant slug for agency hosts, for the branded-shortcut
  // redirect (/admin → /<slug>/admin) without an extra DB roundtrip.
  if (effectiveHostContext.kind === "agency" && effectiveHostContext.tenantSlug) {
    requestHeaders.set(HOST_TENANT_SLUG_HEADER, effectiveHostContext.tenantSlug);
  } else {
    requestHeaders.delete(HOST_TENANT_SLUG_HEADER);
  }

  if (effectiveHostContext.kind === "agency" && effectiveHostContext.domainKind === "path") {
    // MUST be the canonical public prefix (/w/<slug>): downstream strips it to
    // derive the page slug, and a stale `/<slug>` left "w" as the slug.
    requestHeaders.set(PUBLIC_PATH_PREFIX_HEADER, `/${WORKSPACE_PATH_SEGMENT}/${effectiveHostContext.tenantSlug}`);
  } else {
    requestHeaders.delete(PUBLIC_PATH_PREFIX_HEADER);
  }

  let pathnameForAuth = originalPathname;
  const nextUrl = request.nextUrl.clone();
  // Set to the host's tenant slug when the branded shortcut rewrite fires,
  // so the `?next=` normalization below has it without re-narrowing hostContext.
  let brandedWorkspaceShortcutSlug: string | null = null;

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

  // Apply the clean-URL rewrite resolved above. ORIGINAL_PATHNAME_HEADER still
  // carries the browser-facing URL, so EditChromeMount reads the right slug.
  if (cmsSlugRewrite) {
    nextUrl.pathname = cmsSlugRewrite;
    pathnameForAuth = cmsSlugRewrite;
  }

  // Phase 3.12 / 3.13 — branded workspace shortcuts on agency hosts. Keep the
  // branded URL (`/admin`, `/client`) but route through the canonical slug
  // handlers via internal rewrite. Which paths qualify — and why `/talent/*`
  // and `/client/register` must NOT — is documented in `branded-admin-url.ts`.
  if (hostContext.kind === "agency") {
    const shortcut = brandedAdminRewritePath(pathnameForAuth, hostContext.tenantSlug);
    if (shortcut) {
      nextUrl.pathname = shortcut;
      pathnameForAuth = shortcut;
      brandedWorkspaceShortcutSlug = hostContext.tenantSlug;
    }
  }

  const innerRequest = new NextRequest(nextUrl, {
    headers: requestHeaders,
    method: request.method,
  });

  // `forwardedRequestHeaders` carries the guest/actor/locale headers updateSession
  // injected; the rewrite below MUST forward them (see UpdateSessionResult).
  const { response: sessionRes, requestHeaders: forwardedRequestHeaders } =
    await updateSession(innerRequest, {
      pathnameForAuth,
      languageSettings: effectiveLangSettings,
      // Same surface the allow-list ran against: auth routing must not redirect to a path this surface 404s.
      hostKind: effectiveHostContext.kind,
    });

  if (sessionRes.headers.get("location")) {
    // Auth ran against the post-rewrite slug path, so `?next=` would send a
    // signed-out `/admin` visitor back to the doubled URL. See
    // normalizeBrandedNextParam.
    if (brandedWorkspaceShortcutSlug) {
      normalizeBrandedNextParam(sessionRes, brandedWorkspaceShortcutSlug);
    }
    syncLocaleCookieForPath(sessionRes, originalPathname, effectiveLangSettings, request);
    return sessionRes;
  }

  if (
    shouldRewriteLocalePublicPath(originalPathname, effectiveLangSettings) ||
    pathBasedTenantRewrite ||
    cmsSlugRewrite ||
    brandedWorkspaceShortcutSlug !== null ||
    marketingDirectoryRewrite
  ) {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = pathnameForAuth;

    // Forward updateSession's headers (with `x-impronta-guest`), NOT the
    // pre-session `requestHeaders` which lacks it — see the destructure above.
    const res = NextResponse.rewrite(rewriteUrl, {
      request: { headers: forwardedRequestHeaders },
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
    ensureExperimentVisitorCookie(request, res);
    return res;
  }

  syncLocaleCookieForPath(sessionRes, originalPathname, effectiveLangSettings, request);
  ensureExperimentVisitorCookie(request, sessionRes);
  return sessionRes;
}

export const config = {
  matcher: [
    // `sw.js` + `manifest.webmanifest` are static PWA files in `public/` that
    // must serve host-agnostically — without these exclusions the proxy runs
    // host resolution + the surface allow-list on them and 404s every PWA
    // asset on tenant hosts (the service worker then can't register). Mirrors
    // the `favicon.ico` skip.
    //
    // `/offline` is deliberately NOT excluded here: it is a rendered route
    // under the `force-dynamic` root layout, so it MUST go through the proxy
    // to receive the locale + host headers the layout's data loads depend on
    // (bypassing the proxy made it 500). It is instead allow-listed for every
    // host kind in `surface-allow-list.ts`.
    // `api/media/asset` is excluded because next/image's internal fetch carries
    // no `Host`; safe, and why, in `@/lib/media/private-access`.
    "/((?!_next/static|_next/image|api/media/asset|favicon.ico|sw\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
