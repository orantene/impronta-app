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
    "/auth/sso", // TUL-691: SSO redeem only (one-time host-bound token)
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
    "/auth/sso/start", // mint stays on the app host only
    "/talent/register",
    "/directory",
    "/c", // bare reserved slug — not a thread
    "/pay", // bare reserved — checkout needs /pay/<code>
    "/link",
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

test("TUL-350: Stripe return pages /checkout/success and /checkout/cancel pass through on a talent host", () => {
  for (const p of ["/checkout/success", "/checkout/cancel"]) {
    assert.deepEqual(isTalentSiteHostPathAllowed(p), { kind: "passthrough" }, p);
  }
});

test("TUL-350: only the two return pages, never a bare /checkout slug or other children", () => {
  for (const p of ["/checkout", "/checkout/other", "/checkout/success/x"]) {
    assert.equal(isTalentSiteHostPathAllowed(p), null, p);
  }
});

test("Posts v1: /blog/<slug>, /blog/<slug>/og and /blog/c/<category> rewrite into the talent host blog routes", () => {
  assert.deepEqual(isTalentSiteHostPathAllowed("/blog/mi-post"), {
    kind: "blog",
    rewritePath: `${TALENT_SITE_HOST_ROUTE_PREFIX}/blog/mi-post`,
  });
  assert.deepEqual(isTalentSiteHostPathAllowed("/blog/mi-post/og"), {
    kind: "blog",
    rewritePath: `${TALENT_SITE_HOST_ROUTE_PREFIX}/blog/mi-post/og`,
  });
  assert.deepEqual(isTalentSiteHostPathAllowed("/blog/c/tips"), {
    kind: "blog",
    rewritePath: `${TALENT_SITE_HOST_ROUTE_PREFIX}/blog/c/tips`,
  });
  // A bare /blog stays an ordinary page slug (a talent may have a page called blog).
  assert.deepEqual(isTalentSiteHostPathAllowed("/blog"), { kind: "render", pageSlug: "blog" });
  for (const p of ["/blog/a/b", "/blog/c/a/b", "/blog/Bad", "/blog/a.b", "/blog/c"]) {
    const d = isTalentSiteHostPathAllowed(p);
    assert.ok(d === null || (d.kind === "blog" && d.rewritePath.endsWith("/blog/c")), p);
  }
});

test("Posts v1: legacy /posts/<slug> → 301 /blog/<slug>; bare /posts still 404s", () => {
  assert.deepEqual(isTalentSiteHostPathAllowed("/posts/mi-post"), { kind: "redirect", location: "/blog/mi-post", status: 301 });
  assert.equal(isTalentSiteHostPathAllowed("/posts"), null);
  assert.equal(isTalentSiteHostPathAllowed("/posts/a/b"), null);
});

test("Posts v1: /llms.txt passes through on a talent host (the route decides 200/404)", () => {
  assert.deepEqual(isTalentSiteHostPathAllowed("/llms.txt"), { kind: "passthrough" });
});
test("promo share link /p/<slug> renders via the static promo route; bare /p and deeper paths stay 404", () => {
  assert.deepEqual(isTalentSiteHostPathAllowed("/p/empty-week-20"), {
    kind: "render",
    pageSlug: "p/empty-week-20",
  });
  assert.equal(talentSiteHostRewritePath("p/empty-week-20"), "/_talent-site/p/empty-week-20");
  for (const p of ["/p", "/p/", "/p/a/b", "/p/UPPER", "/p/a.b", "/p/-x"]) {
    assert.equal(isTalentSiteHostPathAllowed(p), null, `expected 404 for ${p}`);
  }
});
