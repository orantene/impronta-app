import test from "node:test";
import assert from "node:assert/strict";

import { resolveCanonicalCustomDomainRedirectHost } from "./domain-canonical";

test("redirects non-primary custom domains to the current primary host", () => {
  assert.equal(
    resolveCanonicalCustomDomainRedirectHost({
      currentHost: "alt.improntamodels.com",
      domainKind: "custom",
      isPrimary: false,
      canonicalHost: "improntamodels.com",
      canonicalHostKind: "custom",
    }),
    "improntamodels.com",
  );
});

test("redirects non-primary custom domains to a branded fallback when that is primary", () => {
  assert.equal(
    resolveCanonicalCustomDomainRedirectHost({
      currentHost: "alt.improntamodels.com",
      domainKind: "custom",
      isPrimary: false,
      canonicalHost: "impronta.tulala.digital",
      canonicalHostKind: "subdomain",
    }),
    "impronta.tulala.digital",
  );
});

test("redirects branded subdomains to the primary custom host", () => {
  assert.equal(
    resolveCanonicalCustomDomainRedirectHost({
      currentHost: "impronta.tulala.digital",
      domainKind: "subdomain",
      isPrimary: false,
      canonicalHost: "improntamodels.com",
      canonicalHostKind: "custom",
    }),
    "improntamodels.com",
  );
});

test("does not redirect primary custom domains", () => {
  assert.equal(
    resolveCanonicalCustomDomainRedirectHost({
      currentHost: "improntamodels.com",
      domainKind: "custom",
      isPrimary: true,
      canonicalHost: "improntamodels.com",
      canonicalHostKind: "custom",
    }),
    null,
  );
});

test("does not redirect branded subdomains when the primary host is another subdomain", () => {
  assert.equal(
    resolveCanonicalCustomDomainRedirectHost({
      currentHost: "impronta.tulala.digital",
      domainKind: "subdomain",
      isPrimary: false,
      canonicalHost: "impronta.studiobooking.io",
      canonicalHostKind: "subdomain",
    }),
    null,
  );
});

test("does not redirect path-based storefronts", () => {
  assert.equal(
    resolveCanonicalCustomDomainRedirectHost({
      currentHost: "hub.tulala.digital",
      domainKind: "path",
      isPrimary: false,
      canonicalHost: "improntamodels.com",
      canonicalHostKind: "custom",
    }),
    null,
  );
});

test("redirects legacy .studiobooking.io host to primary custom domain", () => {
  assert.equal(
    resolveCanonicalCustomDomainRedirectHost({
      currentHost: "impronta.studiobooking.io",
      domainKind: "subdomain",
      isPrimary: false,
      canonicalHost: "improntamodels.com",
      canonicalHostKind: "custom",
    }),
    "improntamodels.com",
  );
});

test("redirects legacy .studiobooking.io host to primary .tulala.digital subdomain", () => {
  assert.equal(
    resolveCanonicalCustomDomainRedirectHost({
      currentHost: "impronta.studiobooking.io",
      domainKind: "subdomain",
      isPrimary: false,
      canonicalHost: "impronta.tulala.digital",
      canonicalHostKind: "subdomain",
    }),
    "impronta.tulala.digital",
  );
});

test("does not redirect legacy .studiobooking.io when primary is also .studiobooking.io", () => {
  assert.equal(
    resolveCanonicalCustomDomainRedirectHost({
      currentHost: "alt.studiobooking.io",
      domainKind: "subdomain",
      isPrimary: false,
      canonicalHost: "impronta.studiobooking.io",
      canonicalHostKind: "subdomain",
    }),
    null,
  );
});

test("does not redirect legacy .studiobooking.io when current host is a local preview", () => {
  assert.equal(
    resolveCanonicalCustomDomainRedirectHost({
      currentHost: "impronta.local",
      domainKind: "subdomain",
      isPrimary: false,
      canonicalHost: "improntamodels.com",
      canonicalHostKind: "custom",
    }),
    null,
  );
});

test("does not redirect local preview custom hosts", () => {
  assert.equal(
    resolveCanonicalCustomDomainRedirectHost({
      currentHost: "impronta.local",
      domainKind: "subdomain",
      isPrimary: false,
      canonicalHost: "improntamodels.com",
      canonicalHostKind: "custom",
    }),
    null,
  );
  assert.equal(
    resolveCanonicalCustomDomainRedirectHost({
      currentHost: "alt.impronta.com",
      domainKind: "custom",
      isPrimary: false,
      canonicalHost: "impronta.local",
      canonicalHostKind: "subdomain",
    }),
    null,
  );
});
