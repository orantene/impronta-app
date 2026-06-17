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

test("workspace / auth / multi-segment / dotted paths are NOT allowed (→ 404)", () => {
  for (const p of [
    "/admin",
    "/admin/settings",
    "/login",
    "/talent/register",
    "/directory",
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
