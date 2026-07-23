import test from "node:test";
import assert from "node:assert/strict";

import {
  isPathAllowedForHostKind,
  resolveAnyTenantPublicPath,
  resolvePathBasedTenantPublicPath,
  resolveWorkspacePathTenantPublicPath,
} from "./surface-allow-list";

test("agency host: storefront + workspace + auth + root + static allowed", () => {
  const allowed = [
    "/",
    "/directory",
    "/directory/cart",
    "/t/jane-doe",
    "/p/about",
    "/posts/spring-2026",
    "/models",
    "/share/test-token",
    "/admin",
    "/admin/queue",
    "/client",
    "/client/overview",
    "/talent",
    "/talent/my-profile",
    "/onboarding/role",
    "/invite/some-signed-token",
    "/account",
    "/platform/admin",
    "/impronta/admin",
    "/impronta/admin-preview",
    "/impronta/client",
    "/impronta/talent",
    "/login",
    "/register",
    "/join",
    "/forgot-password",
    "/update-password",
    "/auth/callback",
    "/api/directory",
    "/api/directory/preview/abc",
    "/api/ai/search",
    "/api/ai/interpret-search",
    "/api/ai/refine-suggestions",
    "/api/ai/inquiry-draft",
    "/api/admin/search",
    "/api/admin/inspector/talent",
    "/api/location-cities",
    "/api/location-countries",
    "/api/location-place-details",
    "/api/location-country-details",
    "/api/analytics/events",
    "/api/cron/inquiry-engine",
    "/sitemap.xml",
    "/robots.txt",
  ];
  for (const p of allowed) {
    assert.equal(
      isPathAllowedForHostKind("agency", p),
      true,
      `agency should allow ${p}`,
    );
  }

  const blocked = [
    "/contact",
    "/get-started",
    "/pricing",
    "/legal/privacy",
    "/api/directoryz",
    "/api/admins",
  ];
  for (const p of blocked) {
    assert.equal(
      isPathAllowedForHostKind("agency", p),
      false,
      `agency must 404 ${p}`,
    );
  }
});

test("app host: workspaces + app api + auth + root + static allowed", () => {
  const allowed = [
    "/",
    "/admin",
    "/admin/queue",
    "/client",
    "/client/inquiries",
    "/talent",
    "/talent/my-profile",
    "/onboarding/role",
    "/login",
    "/register",
    "/join",
    "/auth/callback",
    "/api/admin/search",
    "/api/admin/inspector/talent",
    "/api/ai/search",
    "/api/ai/inquiry-draft",
    "/api/directory",
    "/api/directory/preview/abc",
    "/api/location-cities",
    "/api/location-countries",
    "/api/location-place-details",
    "/api/location-country-details",
    "/api/analytics/events",
    "/api/cron/inquiry-engine",
    "/sitemap.xml",
    "/robots.txt",
    // Phase 5/6 M2 — canonical talent surface lives on the app host.
    "/t/jane-doe",
    "/t/t_abc123",
    // Phase 5/6 M5 — invite-accept lives on the app host so cookie scope
    // matches the canonical session / onboarding flow.
    "/invite/some-signed-token",
  ];
  for (const p of allowed) {
    assert.equal(
      isPathAllowedForHostKind("app", p),
      true,
      `app should allow ${p}`,
    );
  }

  const blocked = [
    "/directory",
    "/directory/cart",
    "/p/about",
    "/posts/spring-2026",
    "/models",
    "/contact",
  ];
  for (const p of blocked) {
    assert.equal(
      isPathAllowedForHostKind("app", p),
      false,
      `app must 404 ${p}`,
    );
  }
});

test("canonical talent surface: /t/* allowed on agency + app + marketing + hub", () => {
  // Phase 2.1 — Tulala hosts (app + marketing) serve platform talent profiles at
  // /t/<code>; agency hosts keep the agency-skinned overlay; hub allows the same
  // canonical path on tulala.digital.
  const codes = ["/t/jane-doe", "/t/t_abc123", "/t/some-code/"];
  for (const p of codes) {
    assert.equal(isPathAllowedForHostKind("app", p), true, `app should allow ${p}`);
    assert.equal(isPathAllowedForHostKind("agency", p), true, `agency should allow ${p}`);
    assert.equal(isPathAllowedForHostKind("hub", p), true, `hub should allow ${p}`);
    assert.equal(isPathAllowedForHostKind("marketing", p), true, `marketing should allow ${p}`);
  }
  // Prefix-boundary: /talent (workspace) is NOT /t (canonical).
  assert.equal(isPathAllowedForHostKind("app", "/talent"), true);
  assert.equal(isPathAllowedForHostKind("agency", "/talent"), true);
});

test("read-only deploy diagnostics: /api/health/* allowed on every host kind", () => {
  // /api/health/guest-chat reports only the boolean presence of the Upstash KV
  // env vars (no secrets, no tenant data) and must be reachable unauthenticated
  // so deploy:smoke can probe the deployed runtime. It is host-agnostic
  // (SHARED_API_PREFIXES) like /api/cron and /api/stripe.
  const p = "/api/health/guest-chat";
  for (const kind of ["app", "agency", "hub", "marketing"] as const) {
    assert.equal(isPathAllowedForHostKind(kind, p), true, `${kind} should allow ${p}`);
  }
});

test("QA guest-session reset: /api/dev/reset-guest allowed on every host kind (W0-H)", () => {
  // Unlike the rest of /api/dev/* (bypassed in proxy.ts for dev + preview
  // only), this single route must also reach its handler on PRODUCTION hosts
  // so a logged-in staff member can reset a guest cookie while QA-ing the live
  // guest chat panel. The route's own gate (dev/preview OR staff session)
  // is what actually restricts it; this allow-list entry only lets the
  // request past host resolution. Host-agnostic like /api/health.
  const p = "/api/dev/reset-guest";
  for (const kind of ["app", "agency", "hub", "marketing"] as const) {
    assert.equal(isPathAllowedForHostKind(kind, p), true, `${kind} should allow ${p}`);
  }
});

test("hub host: auth + workspace slug paths + shared routes allowed", () => {
  const allowed = [
    "/",
    "/sitemap.xml",
    "/robots.txt",
    "/api/cron/inquiry-engine",
    "/api/analytics/events",
    "/login",
    "/register",
    "/join",
    "/auth/callback",
    "/impronta/admin",
    "/impronta/admin/queue",
    "/impronta/client",
    "/impronta/talent",
  ];
  for (const p of allowed) {
    assert.equal(
      isPathAllowedForHostKind("hub", p),
      true,
      `hub should allow ${p}`,
    );
  }

  const blocked = [
    "/directory",
    "/admin",
    "/client",
    "/talent",
    "/onboarding/role",
    "/impronta/onboarding/role",
    "/models",
    "/contact",
    "/posts/spring-2026",
    "/p/about",
    "/api/directory",
    "/api/ai/search",
    "/api/admin/search",
    "/api/location-cities",
  ];
  for (const p of blocked) {
    assert.equal(
      isPathAllowedForHostKind("hub", p),
      false,
      `hub must 404 ${p}`,
    );
  }
});

test("path-based tenant public routes strip the tenant prefix before agency dispatch", () => {
  const cases = [
    ["/impronta", "/"],
    ["/impronta/t/jane-doe", "/t/jane-doe"],
    ["/impronta/directory", "/directory"],
    ["/impronta/directory/cart", "/directory/cart"],
    ["/impronta/models", "/models"],
    ["/impronta/p/about", "/p/about"],
    ["/impronta/posts/spring-2026", "/posts/spring-2026"],
    ["/impronta/contact", "/contact"],
    ["/impronta/talent/register", "/talent/register"],
    ["/impronta/client/register", "/client/register"],
    ["/impronta/join", "/join"],
  ] as const;

  for (const [path, stripped] of cases) {
    assert.deepEqual(
      resolvePathBasedTenantPublicPath(path),
      { tenantSlug: "impronta", pathnameWithoutTenant: stripped },
      `${path} should strip to ${stripped}`,
    );
  }
});

test("path-based tenant public routes do not swallow workspace or reserved routes", () => {
  const blocked = [
    "/impronta/admin",
    "/impronta/client",
    "/impronta/client/inquiries/new",
    "/impronta/talent",
    "/impronta/onboarding/role",
    "/impronta/api/directory",
    "/pricing",
    "/discover-agencies",
    "/directory",
    "/t/jane-doe",
  ];

  for (const path of blocked) {
    assert.equal(resolvePathBasedTenantPublicPath(path), null, `${path} must not strip`);
  }
});

test("canonical /w/<slug> resolves the same shapes as the legacy flat form", () => {
  const cases = [
    ["/w/impronta", "/"],
    ["/w/impronta/directory", "/directory"],
    ["/w/impronta/t/jane-doe", "/t/jane-doe"],
    ["/w/impronta/p/about", "/p/about"],
    ["/w/impronta/contact", "/contact"],
    ["/w/impronta/join", "/join"],
  ] as const;

  for (const [path, stripped] of cases) {
    assert.deepEqual(
      resolveWorkspacePathTenantPublicPath(path),
      { tenantSlug: "impronta", pathnameWithoutTenant: stripped },
      `${path} should strip to ${stripped}`,
    );
  }
});

test("/w resolver only matches the canonical prefix, and never eats reserved routes", () => {
  // Flat form is NOT canonical — middleware 301s it instead of serving it.
  assert.equal(resolveWorkspacePathTenantPublicPath("/impronta"), null);
  // Bare parent is not a tenant.
  assert.equal(resolveWorkspacePathTenantPublicPath("/w"), null);
  assert.equal(resolveWorkspacePathTenantPublicPath("/w/"), null);
  // Workspace surfaces stay out of the public path-based shape.
  assert.equal(resolveWorkspacePathTenantPublicPath("/w/impronta/admin"), null);
  // "w" itself is reserved, so it can never resolve as a tenant slug.
  assert.equal(resolvePathBasedTenantPublicPath("/w"), null);
});

test("resolveAnyTenantPublicPath accepts canonical and legacy during migration", () => {
  const expected = { tenantSlug: "impronta", pathnameWithoutTenant: "/directory" };
  assert.deepEqual(resolveAnyTenantPublicPath("/w/impronta/directory"), expected);
  assert.deepEqual(resolveAnyTenantPublicPath("/impronta/directory"), expected);
  assert.equal(resolveAnyTenantPublicPath("/pricing"), null);
});

test("marketing host: public marketing pages + root + static + bearer-gated shared api allowed", () => {
  const allowed = [
    "/",
    "/sitemap.xml",
    "/robots.txt",
    "/opengraph-image",
    "/twitter-image",
    "/for/models",
    "/for/musicians",
    "/resources",
    "/resources/glossary",
    "/resources/booking-deposits",
    "/api/cron/inquiry-engine",
    "/api/analytics/events",
    "/t/jane-doe",
    "/get-started",
    "/discover-agencies",
    "/operators",
    "/agencies",
    "/organizations",
    "/how-it-works",
    "/network",
    "/integrations",
    "/pricing",
    "/faq",
    "/waitlist",
    "/legal/privacy",
    "/legal/terms",
    // Global Talent Directory — public cross-tenant browse on the marketing host.
    "/directory",
    // Auth surfaces are reachable on the marketing apex (tulala.digital): OAuth
    // callbacks use window.location.origin as the redirectTo base, and the
    // branded sign-in / registration entry points live on the apex too. The
    // marketing branch returns anyPrefix(pathname, AUTH_PREFIXES) — commit
    // f1a456b2a "allow AUTH_PREFIXES on marketing host for OAuth callback".
    "/login",
    "/register",
    "/join",
    "/auth/callback",
  ];
  for (const p of allowed) {
    assert.equal(
      isPathAllowedForHostKind("marketing", p),
      true,
      `marketing should allow ${p}`,
    );
  }

  const blocked = [
    "/admin",
    "/client",
    "/talent",
    "/onboarding/role",
    "/models",
    "/contact",
    "/api/directory",
    "/api/ai/search",
    "/api/admin/search",
    "/api/location-cities",
    "/operator",
    "/agency",
    "/pricing-plan",
    "/get-started-today",
  ];
  for (const p of blocked) {
    assert.equal(
      isPathAllowedForHostKind("marketing", p),
      false,
      `marketing must 404 ${p}`,
    );
  }
});

test("marketing host: non-marketing hosts must 404 marketing pages", () => {
  const marketingPages = [
    "/get-started",
    "/discover-agencies",
    "/operators",
    "/agencies",
    "/organizations",
    "/how-it-works",
    "/network",
    "/integrations",
    "/pricing",
    "/faq",
    "/waitlist",
    "/legal/privacy",
  ];
  for (const p of marketingPages) {
    assert.equal(isPathAllowedForHostKind("agency", p), false, `agency must 404 ${p}`);
    assert.equal(isPathAllowedForHostKind("app", p), false, `app must 404 ${p}`);
    assert.equal(isPathAllowedForHostKind("hub", p), false, `hub must 404 ${p}`);
  }
});

test("compliance endpoints: /unsubscribe + /api/unsubscribe allowed on every host kind", () => {
  // One-click unsubscribe links are global (built against the platform site
  // URL) but may be opened from any host context, so they must never 404.
  const compliance = [
    "/unsubscribe/abc-token",
    "/unsubscribe/abc-token/",
    "/api/unsubscribe/abc-token",
  ];
  for (const kind of ["agency", "app", "hub", "marketing"] as const) {
    for (const p of compliance) {
      assert.equal(
        isPathAllowedForHostKind(kind, p),
        true,
        `${kind} should allow ${p}`,
      );
    }
  }
  // Segment-boundary protection — a lookalike prefix must not be swallowed.
  assert.equal(isPathAllowedForHostKind("marketing", "/unsubscribexyz"), false);
  assert.equal(isPathAllowedForHostKind("app", "/api/unsubscribexyz"), false);
});

test("PWA offline fallback: /offline allowed on every host kind", () => {
  // The service worker pre-caches /offline by fetching it over the network
  // during install, so it must return 200 on every host (app, agency
  // subdomain, custom domain, hub) — otherwise the SW can never cache the
  // fallback and tenant hosts 404 the offline page.
  for (const kind of ["agency", "app", "hub", "marketing"] as const) {
    assert.equal(
      isPathAllowedForHostKind(kind, "/offline"),
      true,
      `${kind} should allow /offline`,
    );
  }
  // Exact match only — a lookalike must not be swallowed.
  assert.equal(isPathAllowedForHostKind("app", "/offline-mode"), false);
});

test("prefix boundaries: /talented is not /talent, /administration is not /admin", () => {
  // Segment boundary protection — workspace prefixes must not swallow
  // storefront routes that happen to share a leading substring.
  assert.equal(isPathAllowedForHostKind("agency", "/talented"), false);
  assert.equal(isPathAllowedForHostKind("app", "/talented"), false);
  assert.equal(isPathAllowedForHostKind("app", "/administration"), false);
  // Exact match still works.
  assert.equal(isPathAllowedForHostKind("app", "/talent"), true);
  assert.equal(isPathAllowedForHostKind("app", "/admin"), true);
});

test("api segment boundaries: /api/directoryz ≠ /api/directory, /api/admins ≠ /api/admin", () => {
  // Hyphenated location routes are exact-match; prefix routes are segment-safe.
  assert.equal(isPathAllowedForHostKind("agency", "/api/directoryz"), false);
  assert.equal(isPathAllowedForHostKind("app", "/api/admins"), false);
  // `/api/location-cities` is exact; `/api/location-citiesz` must not match.
  assert.equal(isPathAllowedForHostKind("app", "/api/location-citiesz"), false);
  // And `/api/location` prefix alone must not leak to the hyphenated routes.
  assert.equal(isPathAllowedForHostKind("app", "/api/location"), false);
});

test("post-checkout landing is reachable on every host kind (Stripe redirects to request origin)", () => {
  for (const kind of ["agency", "app", "hub", "marketing"] as const) {
    assert.equal(isPathAllowedForHostKind(kind, "/checkout/success"), true, kind);
    assert.equal(isPathAllowedForHostKind(kind, "/checkout/cancel"), true, kind);
  }
  // Segment-safe: `/checkoutz` must not match the `/checkout` prefix.
  assert.equal(isPathAllowedForHostKind("app", "/checkoutz"), false);
});

test("public embed loader + roster widget reachable on every host kind (partner iframes)", () => {
  for (const kind of ["agency", "app", "hub", "marketing"] as const) {
    assert.equal(isPathAllowedForHostKind(kind, "/embed"), true, kind);
    assert.equal(isPathAllowedForHostKind(kind, "/embed.js"), true, kind);
    assert.equal(isPathAllowedForHostKind(kind, "/embed/roster/impronta"), true, kind);
  }
  // `/embedz` must not match the `/embed` prefix; `/embed.jsz` is not the exact loader.
  assert.equal(isPathAllowedForHostKind("marketing", "/embedz"), false);
  assert.equal(isPathAllowedForHostKind("marketing", "/embed.jsz"), false);
});

test("team-invite + template-preview reachable on agency + app workspace hosts", () => {
  assert.equal(isPathAllowedForHostKind("agency", "/team-invite/abc123"), true);
  assert.equal(isPathAllowedForHostKind("app", "/team-invite/abc123"), true);
  assert.equal(isPathAllowedForHostKind("agency", "/template-preview/editorial-lux"), true);
  assert.equal(isPathAllowedForHostKind("app", "/template-preview/editorial-lux"), true);
});
