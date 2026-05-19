/**
 * custom-domain-routing.security.test.ts — characterization of custom-domain
 * DNS validation in src/lib/saas/custom-domain-routing.ts.
 *
 * Custom domains are a tenant-attachment surface: accepting the wrong CNAME
 * target or mis-classifying apex vs subdomain can mis-route a tenant's
 * storefront. Companion to custom-domain-routing.test.ts (3 happy-path checks).
 * All pure → behavioural.
 *
 * Does NOT fix anything. Weak cases are `{ skip: "SECURITY FLAG: …" }`.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCustomDomainRoutingRecords,
  customDomainCanBecomePrimary,
  customDomainNeedsRouting,
  isAcceptedVercelCname,
  isLikelyApexCustomDomain,
  normalizeDnsComparableValue,
} from "./custom-domain-routing";

// ─────────────────────────────────────────────────────────────────────────────
// isAcceptedVercelCname — is this DNS target "really Vercel"? Loose match risk.
// ─────────────────────────────────────────────────────────────────────────────

test("isAcceptedVercelCname: accepts the exact canonical targets (case/dot-insensitive)", () => {
  assert.equal(isAcceptedVercelCname("cname.vercel-dns-0.com"), true);
  assert.equal(isAcceptedVercelCname("cname.vercel-dns.com"), true);
  assert.equal(isAcceptedVercelCname("  CNAME.VERCEL-DNS.COM.  "), true, "trim + lowercase + trailing dot");
});

test("isAcceptedVercelCname: rejects an unrelated target", () => {
  assert.equal(isAcceptedVercelCname("ghs.googlehosted.com"), false);
  assert.equal(isAcceptedVercelCname(""), false);
});

test(
  "isAcceptedVercelCname: attacker hostnames merely CONTAINING 'vercel-dns' are REJECTED [HARDENED 2026-05-19]",
  () => {
    // HARDENED behaviour (was the substring-bypass SECURITY FLAG): acceptance
    // now requires the registrable zone to actually be vercel-dns(.|-N.)com,
    // not a bare `includes("vercel-dns")`. These attacker-controlled zones —
    // attacker.com / evil.io / example.com — must NOT verify as Vercel.
    assert.equal(isAcceptedVercelCname("vercel-dns.attacker.com"), false);
    assert.equal(isAcceptedVercelCname("not-vercel-dns.evil.io"), false);
    assert.equal(isAcceptedVercelCname("x.vercel-dns.example.com"), false);
    assert.equal(isAcceptedVercelCname("vercel-dns.com.attacker.net"), false, "zone is attacker.net");
    assert.equal(isAcceptedVercelCname("evil-vercel-dns.com"), false, "label is evil-vercel-dns, not a vercel-dns subdomain");
    // Legitimate Vercel zones still accepted (incl. non-canonical sub-labels).
    assert.equal(isAcceptedVercelCname("cname.vercel-dns.com"), true);
    assert.equal(isAcceptedVercelCname("cname.vercel-dns-7.com"), true, "regional vercel-dns-N zone");
    assert.equal(isAcceptedVercelCname("vercel-dns.com"), true, "bare Vercel apex zone");
  },
);

test("normalizeDnsComparableValue: trims, lowercases, strips ALL trailing dots (FQDN form)", () => {
  assert.equal(normalizeDnsComparableValue("  Foo.Bar.COM..  "), "foo.bar.com");
  assert.equal(normalizeDnsComparableValue("a.b."), "a.b");
});

// ─────────────────────────────────────────────────────────────────────────────
// apex vs subdomain classification — drives A-record vs CNAME, which decides
// where a tenant's traffic actually lands.
// ─────────────────────────────────────────────────────────────────────────────

test("isLikelyApexCustomDomain: bare apex true; www/subdomain false; public-suffix aware", () => {
  assert.equal(isLikelyApexCustomDomain("example.com"), true);
  assert.equal(isLikelyApexCustomDomain("www.example.com"), false);
  assert.equal(isLikelyApexCustomDomain("example.co.uk"), true, "registrable apex under a 2-level suffix");
  assert.equal(isLikelyApexCustomDomain("shop.example.co.uk"), false);
  assert.equal(isLikelyApexCustomDomain("  EXAMPLE.COM  "), true, "trim + lowercase before classify");
});

test("buildCustomDomainRoutingRecords: apex → single A record at the Vercel apex IP", () => {
  assert.deepEqual(buildCustomDomainRoutingRecords("example.com"), [
    { type: "A", host: "@", value: "76.76.21.21" },
  ]);
  assert.deepEqual(buildCustomDomainRoutingRecords("example.co.uk"), [
    { type: "A", host: "@", value: "76.76.21.21" },
  ]);
});

test("buildCustomDomainRoutingRecords: subdomain → CNAME with the correct host label(s)", () => {
  assert.deepEqual(buildCustomDomainRoutingRecords("www.example.com"), [
    { type: "CNAME", host: "www", value: "cname.vercel-dns-0.com" },
  ]);
  assert.deepEqual(buildCustomDomainRoutingRecords("www.studio.example.com"), [
    { type: "CNAME", host: "www.studio", value: "cname.vercel-dns-0.com" },
  ]);
  assert.deepEqual(buildCustomDomainRoutingRecords("shop.example.co.uk"), [
    { type: "CNAME", host: "shop", value: "cname.vercel-dns-0.com" },
  ]);
});

test("buildCustomDomainRoutingRecords: empty / whitespace-only host yields NO records (fails closed)", () => {
  assert.deepEqual(buildCustomDomainRoutingRecords(""), []);
  assert.deepEqual(buildCustomDomainRoutingRecords("   "), []);
});

// ─────────────────────────────────────────────────────────────────────────────
// lifecycle gates — when may a custom domain become primary / need routing.
// ─────────────────────────────────────────────────────────────────────────────

test("customDomainCanBecomePrimary: ONLY 'active' (every other state incl. null/unknown → false)", () => {
  assert.equal(customDomainCanBecomePrimary("active"), true);
  for (const s of ["verified", "ssl_provisioned", "pending", "failed", "removed", "", null]) {
    assert.equal(customDomainCanBecomePrimary(s), false, `status=${String(s)} must not become primary`);
  }
});

test("customDomainNeedsRouting: only 'verified' | 'ssl_provisioned' (NOT 'active' — already routed; null → false)", () => {
  assert.equal(customDomainNeedsRouting("verified"), true);
  assert.equal(customDomainNeedsRouting("ssl_provisioned"), true);
  assert.equal(customDomainNeedsRouting("active"), false);
  assert.equal(customDomainNeedsRouting(null), false);
  assert.equal(customDomainNeedsRouting("pending"), false);
});
