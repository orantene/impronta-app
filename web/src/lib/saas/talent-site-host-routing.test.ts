import assert from "node:assert/strict";
import test from "node:test";

import {
  isTalentSiteHostPathAllowed,
  talentSiteHostRewritePath,
  TALENT_SITE_HOST_ROUTE_PREFIX,
} from "./talent-site-host-routing";

test("site home resolves to a render with a null page slug", () => {
  assert.deepEqual(isTalentSiteHostPathAllowed("/"), {
    kind: "render",
    pageSlug: null,
  });
});

test("single-segment slug resolves to that inner page", () => {
  assert.deepEqual(isTalentSiteHostPathAllowed("/about"), {
    kind: "render",
    pageSlug: "about",
  });
  assert.deepEqual(isTalentSiteHostPathAllowed("/my-services"), {
    kind: "render",
    pageSlug: "my-services",
  });
});

test("shared plumbing + static assets pass through untouched", () => {
  for (const p of [
    "/api/cron/x",
    "/api/stripe/webhook",
    "/_next/static/chunk.js",
    "/unsubscribe/tok",
    "/c/00000000-0000-4000-8000-000000000001",
    "/pay/opaque-link-code",
    "/link/opaque-link-code",
    "/auth/apple",
    "/auth/google",
    "/auth/callback",
    "/sitemap.xml",
    "/robots.txt",
    "/favicon.ico",
  ]) {
    assert.deepEqual(
      isTalentSiteHostPathAllowed(p),
      { kind: "passthrough" },
      `expected passthrough for ${p}`,
    );
  }
});

test("workspace / login / multi-segment / dotted paths are NOT allowed (→ 404)", () => {
  for (const p of [
    "/admin",
    "/admin/settings",
    "/login",
    "/register",
    "/auth", // bare reserved — OAuth needs exact /auth/google|/auth/callback
    "/auth/sign-out",
    "/auth/confirm",
    "/auth/sso",
    "/auth/sso/start",
    "/talent/register",
    "/directory",
    "/c", // bare reserved slug — not a thread
    "/pay", // bare reserved — checkout needs /pay/<code>
    "/link",
    "/agendar", // booking alias — redirected in host-response, never a page slug
    "/book",
    "/about/extra", // multi-segment
    "/foo.bar", // dotted
    "/Upper", // uppercase
    "/-leading", // leading hyphen
  ]) {
    assert.equal(
      isTalentSiteHostPathAllowed(p),
      null,
      `expected null (404) for ${p}`,
    );
  }
});

test("unknown single-segment paths still render (soft-404 if page missing)", () => {
  // Allow-list accepts the slug; missing pages soft-404 inside the site shell.
  assert.deepEqual(isTalentSiteHostPathAllowed("/pagina-que-no-existe"), {
    kind: "render",
    pageSlug: "pagina-que-no-existe",
  });
});

test("rewrite path targets the internal host route", () => {
  assert.equal(talentSiteHostRewritePath(null), TALENT_SITE_HOST_ROUTE_PREFIX);
  assert.equal(
    talentSiteHostRewritePath("about"),
    `${TALENT_SITE_HOST_ROUTE_PREFIX}/about`,
  );
});

test("client account area (TUL-62): exact /account and the three detail families pass through", () => {
  for (const p of ["/account", "/account/visits/abc", "/account/messages/abc", "/account/receipts/CODE"]) {
    assert.deepEqual(isTalentSiteHostPathAllowed(p), { kind: "passthrough" }, p);
  }
});

test("client account area (TUL-62): nothing else under /account is reachable on a talent host", () => {
  for (const p of ["/account/brief", "/account/", "/account/brief/agent", "/account/visits"]) {
    assert.equal(isTalentSiteHostPathAllowed(p), null, p);
  }
  // `/accounts` is an ordinary page slug, not the account area.
  assert.deepEqual(isTalentSiteHostPathAllowed("/accounts"), { kind: "render", pageSlug: "accounts" });
});
