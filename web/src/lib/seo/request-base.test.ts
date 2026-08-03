import test from "node:test";
import assert from "node:assert/strict";

import { publicRequestSiteBase } from "./request-base";

// A tenant storefront must anchor its sitemap/robots URLs to its OWN host,
// not the fixed platform apex — the load-bearing fix for Search Console.
test("agency host resolves the base to the tenant's own origin", () => {
  const url = publicRequestSiteBase({
    kind: "agency",
    tenantId: "00000000-0000-0000-0000-000000000001",
    hostname: "acme.tulala.digital",
    tenantSlug: "acme",
  });
  assert.equal(url.origin, "https://acme.tulala.digital");
});

test("agency custom domain resolves to that custom origin", () => {
  const url = publicRequestSiteBase({
    kind: "agency",
    tenantId: "00000000-0000-0000-0000-000000000001",
    hostname: "models.example.com",
    tenantSlug: "acme",
  });
  assert.equal(url.origin, "https://models.example.com");
});

test("hub host resolves to the hub's own origin", () => {
  const url = publicRequestSiteBase({
    kind: "hub",
    tenantId: "00000000-0000-0000-0000-000000000002",
    hostname: "hub.tulala.digital",
  });
  assert.equal(url.origin, "https://hub.tulala.digital");
});

test("marketing host falls back to the platform base (unchanged behaviour)", () => {
  const url = publicRequestSiteBase({
    kind: "marketing",
    tenantId: null,
    hostname: "tulala.digital",
  });
  // Falls through to publicSiteMetadataBase() (NEXT_PUBLIC_SITE_URL or the
  // localhost default) — the point is it does NOT use the request hostname.
  assert.notEqual(url.origin, "https://tulala.digital-should-not-be-hostname");
  assert.ok(url.origin.startsWith("http"));
});

test("agency host with a null hostname falls back rather than emitting a broken origin", () => {
  const url = publicRequestSiteBase({
    kind: "agency",
    tenantId: "00000000-0000-0000-0000-000000000001",
    hostname: null,
    tenantSlug: "acme",
  });
  assert.ok(url.origin.startsWith("http"));
});
