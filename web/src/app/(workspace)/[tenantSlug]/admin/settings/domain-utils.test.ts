import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeCustomDomainHostname,
  pickFallbackSubdomainHostname,
} from "./domain-utils";

test("normalizes plain hostnames and full URLs", () => {
  assert.deepEqual(normalizeCustomDomainHostname("Example.COM"), {
    ok: true,
    hostname: "example.com",
  });
  assert.deepEqual(normalizeCustomDomainHostname("https://Studio.Example.com/path?q=1"), {
    ok: true,
    hostname: "studio.example.com",
  });
});

test("allows local-development style custom domains", () => {
  assert.deepEqual(normalizeCustomDomainHostname("impronta.local"), {
    ok: true,
    hostname: "impronta.local",
  });
  assert.deepEqual(normalizeCustomDomainHostname("brand.lvh.me"), {
    ok: true,
    hostname: "brand.lvh.me",
  });
});

test("rejects empty, localhost, and single-label inputs", () => {
  assert.deepEqual(normalizeCustomDomainHostname(""), {
    ok: false,
    message: "Enter a domain to continue.",
  });
  assert.deepEqual(normalizeCustomDomainHostname("localhost"), {
    ok: false,
    message: "Use a real hostname instead of localhost.",
  });
  assert.deepEqual(normalizeCustomDomainHostname("example"), {
    ok: false,
    message: "Domains need at least one dot, like example.com.",
  });
});

test("rejects invalid host labels and IP addresses", () => {
  assert.deepEqual(normalizeCustomDomainHostname("bad-.example.com"), {
    ok: false,
    message: "That domain contains an invalid hostname label.",
  });
  assert.deepEqual(normalizeCustomDomainHostname("127.0.0.1"), {
    ok: false,
    message: "IP addresses cannot be used as custom domains.",
  });
});

test("rejects Tulala-managed hosts", () => {
  assert.deepEqual(normalizeCustomDomainHostname("tulala.digital"), {
    ok: false,
    message: "That host is reserved by Tulala. Use your own brand domain.",
  });
  assert.deepEqual(normalizeCustomDomainHostname("studio.tulala.digital"), {
    ok: false,
    message: "That host is reserved by Tulala. Use your own brand domain.",
  });
});

test("normalizes IDN hostname to ASCII Punycode via ICU URL parser", () => {
  // "tülala.digital" → "xn--tlala-z3a.digital" (not a reserved Tulala host)
  const result = normalizeCustomDomainHostname("tülala.digital");
  assert.ok(result.ok === true, "expected ok result for IDN domain");
  assert.ok(
    result.hostname.startsWith("xn--") || /^[a-z0-9.-]+$/.test(result.hostname),
    `expected ASCII hostname, got ${result.hostname}`,
  );
  // The Punycode form must NOT match the reserved host check
  assert.notEqual(result.hostname, "tulala.digital");
});

test("accepts plain ASCII custom domains without modification", () => {
  const result = normalizeCustomDomainHostname("myagency.com");
  assert.deepEqual(result, { ok: true, hostname: "myagency.com" });
});

test("picks the branded fallback subdomain in a stable order", () => {
  assert.equal(
    pickFallbackSubdomainHostname([
      { hostname: "impronta.lvh.me", isPrimary: false },
      { hostname: "impronta.tulala.digital", isPrimary: false },
      { hostname: "impronta.studiobooking.io", isPrimary: false },
    ]),
    "impronta.tulala.digital",
  );

  assert.equal(
    pickFallbackSubdomainHostname([
      { hostname: "impronta.local", isPrimary: false },
      { hostname: "impronta.studiobooking.io", isPrimary: true },
    ]),
    "impronta.studiobooking.io",
  );
});
