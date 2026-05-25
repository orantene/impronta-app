import test from "node:test";
import assert from "node:assert/strict";

import {
  isPathAllowedForHostKind,
  resolvePathBasedTenantPublicPath,
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
    "/directory",
    "/t/jane-doe",
  ];

  for (const path of blocked) {
    assert.equal(resolvePathBasedTenantPublicPath(path), null, `${path} must not strip`);
  }
});

test("marketing host: public marketing pages + root + static + bearer-gated shared api allowed", () => {
  const allowed = [
    "/",
    "/sitemap.xml",
    "/robots.txt",
    "/api/cron/inquiry-engine",
    "/api/analytics/events",
    "/t/jane-doe",
    "/get-started",
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
  ];
  for (const p of allowed) {
    assert.equal(
      isPathAllowedForHostKind("marketing", p),
      true,
      `marketing should allow ${p}`,
    );
  }

  const blocked = [
    "/directory",
    "/admin",
    "/client",
    "/talent",
    "/login",
    "/join",
    "/onboarding/role",
    "/models",
    "/contact",
    "/auth/callback",
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
