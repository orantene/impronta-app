import test from "node:test";
import assert from "node:assert/strict";
import {
  filterOperatorFacingCustomDomains,
  filterOperatorFacingSubdomains,
  findPrimaryCustomDomain,
  listAlternateCustomDomains,
  resolveCustomDomainAliasRedirect,
  suggestAlternateCustomDomainHostname,
} from "./domain-display";

test("filterOperatorFacingCustomDomains hides local preview rows when a public domain exists", () => {
  const rows = [
    { hostname: "impronta.local" },
    { hostname: "improntamodels.com" },
  ];

  assert.deepEqual(filterOperatorFacingCustomDomains(rows), [{ hostname: "improntamodels.com" }]);
});

test("filterOperatorFacingSubdomains hides local and legacy branded hosts when a Tulala host exists", () => {
  const rows = [
    { hostname: "impronta.local" },
    { hostname: "impronta.studiobooking.io" },
    { hostname: "impronta.tulala.digital" },
  ];

  assert.deepEqual(filterOperatorFacingSubdomains(rows), [{ hostname: "impronta.tulala.digital" }]);
});

test("filterOperatorFacingSubdomains keeps legacy branded hosts when no newer public host exists", () => {
  const rows = [
    { hostname: "impronta.local" },
    { hostname: "impronta.studiobooking.io" },
  ];

  assert.deepEqual(filterOperatorFacingSubdomains(rows), [{ hostname: "impronta.studiobooking.io" }]);
});

test("filterOperatorFacingSubdomains falls back to local preview hosts when nothing else exists", () => {
  const rows = [{ hostname: "impronta.local" }];

  assert.deepEqual(filterOperatorFacingSubdomains(rows), rows);
});

test("findPrimaryCustomDomain returns the current primary row", () => {
  const rows = [
    { hostname: "www.improntamodels.com", isPrimary: false },
    { hostname: "improntamodels.com", isPrimary: true },
  ];

  assert.deepEqual(findPrimaryCustomDomain(rows), rows[1]);
});

test("listAlternateCustomDomains excludes the current primary row", () => {
  const rows = [
    { hostname: "www.improntamodels.com", isPrimary: false },
    { hostname: "improntamodels.com", isPrimary: true },
    { hostname: "impronta.mx", isPrimary: false },
  ];

  assert.deepEqual(listAlternateCustomDomains(rows), [rows[0], rows[2]]);
});

test("suggestAlternateCustomDomainHostname recommends the www alias for apex primaries", () => {
  const rows = [{ hostname: "improntamodels.com", isPrimary: true }];

  assert.equal(suggestAlternateCustomDomainHostname(rows), "www.improntamodels.com");
});

test("suggestAlternateCustomDomainHostname recommends the bare alias for www primaries", () => {
  const rows = [{ hostname: "www.improntamodels.com", isPrimary: true }];

  assert.equal(suggestAlternateCustomDomainHostname(rows), "improntamodels.com");
});

test("suggestAlternateCustomDomainHostname returns null when the alias already exists", () => {
  const rows = [
    { hostname: "improntamodels.com", isPrimary: true },
    { hostname: "www.improntamodels.com", isPrimary: false },
  ];

  assert.equal(suggestAlternateCustomDomainHostname(rows), null);
});

test("suggestAlternateCustomDomainHostname returns null without a primary custom domain", () => {
  const rows = [{ hostname: "www.improntamodels.com", isPrimary: false }];

  assert.equal(suggestAlternateCustomDomainHostname(rows), null);
});

test("resolveCustomDomainAliasRedirect identifies www to bare redirects", () => {
  const rows = [
    { hostname: "improntamodels.com", isPrimary: true },
    { hostname: "www.improntamodels.com", isPrimary: false },
  ];

  assert.deepEqual(resolveCustomDomainAliasRedirect(rows), {
    baseHostname: "improntamodels.com",
    primaryDomain: rows[0],
    alternateDomain: rows[1],
    mode: "www_to_bare",
  });
});

test("resolveCustomDomainAliasRedirect identifies bare to www redirects", () => {
  const rows = [
    { hostname: "www.improntamodels.com", isPrimary: true },
    { hostname: "improntamodels.com", isPrimary: false },
  ];

  assert.deepEqual(resolveCustomDomainAliasRedirect(rows), {
    baseHostname: "improntamodels.com",
    primaryDomain: rows[0],
    alternateDomain: rows[1],
    mode: "bare_to_www",
  });
});

test("resolveCustomDomainAliasRedirect returns null for unrelated alternates", () => {
  const rows = [
    { hostname: "improntamodels.com", isPrimary: true },
    { hostname: "booking.improntamodels.com", isPrimary: false },
  ];

  assert.equal(resolveCustomDomainAliasRedirect(rows), null);
});
