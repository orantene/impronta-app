import assert from "node:assert/strict";
import test from "node:test";

import { siteBasePath, withSiteBasePath } from "./site-base-path";

const HREFS = { home: "/", catalogue: "/servicios", transaction: "/agendar" };

test("free workspace without a domain links under /w/<slug>", () => {
  const base = siteBasePath({ slug: "qa-fresh-studio-2", planTier: "free", domains: [] });
  assert.equal(base, "/w/qa-fresh-studio-2");
  const out = withSiteBasePath(HREFS, base);
  assert.equal(out.transaction, "/w/qa-fresh-studio-2/agendar");
  assert.equal(out.catalogue, "/w/qa-fresh-studio-2/servicios");
  assert.equal(out.home, "/w/qa-fresh-studio-2");
});

test("a live branded subdomain or custom domain keeps root paths", () => {
  const sub = siteBasePath({
    slug: "acme",
    planTier: "studio",
    domains: [{ hostname: "acme.tulala.digital", kind: "subdomain", status: "active", is_primary: true }],
  });
  assert.equal(sub, "");
  const custom = siteBasePath({
    slug: "acme",
    planTier: "website",
    domains: [{ hostname: "acme.com", kind: "custom", status: "verified", is_primary: true }],
  });
  assert.equal(custom, "");
  assert.equal(withSiteBasePath(HREFS, custom).transaction, "/agendar");
});

test("a pending domain row is not an address: stay on the path host", () => {
  const base = siteBasePath({
    slug: "acme",
    planTier: "studio",
    domains: [{ hostname: "acme.tulala.digital", kind: "subdomain", status: "pending", is_primary: true }],
  });
  assert.equal(base, "/w/acme");
});

test("prefixing is idempotent", () => {
  const once = withSiteBasePath(HREFS, "/w/acme");
  assert.deepEqual(withSiteBasePath(once, "/w/acme"), once);
});
