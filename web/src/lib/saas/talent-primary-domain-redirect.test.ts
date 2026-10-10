import assert from "node:assert/strict";
import test from "node:test";

import { resolveCanonicalCustomDomainRedirectHost } from "./domain-canonical";
import {
  counterpartWwwOrApex,
  resolveTalentPrimaryDomainRedirect,
  resolveTalentWwwApexRedirect,
  talentUsesSamePrimaryHostIdeaAsAgency,
} from "./talent-primary-domain-redirect";

test("subdomain → active primary keeps path + query (/en kept)", () => {
  const out = resolveTalentPrimaryDomainRedirect({
    surface: "subdomain",
    method: "GET",
    currentHost: "sofia.tulala.digital",
    pathname: "/en/book",
    search: "?utm=1",
    primaryActiveDomain: "sofia.studio",
  });
  assert.deepEqual(out, {
    hostname: "sofia.studio",
    pathname: "/en/book",
    search: "?utm=1",
    status: 308,
  });
});

test("hub /t/<code> → custom home (empty path)", () => {
  const out = resolveTalentPrimaryDomainRedirect({
    surface: "hub",
    method: "GET",
    currentHost: "tulala.digital",
    pathname: "/t/TAL-95004",
    search: "?x=1",
    primaryActiveDomain: "max-site.test",
  });
  assert.deepEqual(out, {
    hostname: "max-site.test",
    pathname: "/",
    search: "",
    status: 308,
  });
});

test("hub staff bypass does not redirect", () => {
  assert.equal(
    resolveTalentPrimaryDomainRedirect({
      surface: "hub",
      method: "GET",
      currentHost: "tulala.digital",
      pathname: "/t/TAL-95004",
      search: "",
      primaryActiveDomain: "max-site.test",
      hubStaffBypass: true,
    }),
    null,
  );
});

test("never redirects when primary is missing or not active (null)", () => {
  assert.equal(
    resolveTalentPrimaryDomainRedirect({
      surface: "subdomain",
      method: "GET",
      currentHost: "sofia.tulala.digital",
      pathname: "/",
      search: "",
      primaryActiveDomain: null,
    }),
    null,
  );
});

test("never redirects POST (body-safe)", () => {
  assert.equal(
    resolveTalentPrimaryDomainRedirect({
      surface: "subdomain",
      method: "POST",
      currentHost: "sofia.tulala.digital",
      pathname: "/",
      search: "",
      primaryActiveDomain: "sofia.studio",
    }),
    null,
  );
});

test("already on primary → no redirect", () => {
  assert.equal(
    resolveTalentPrimaryDomainRedirect({
      surface: "custom_alias",
      method: "GET",
      currentHost: "sofia.studio",
      pathname: "/",
      search: "",
      primaryActiveDomain: "sofia.studio",
    }),
    null,
  );
});

test("www → apex when apex is primary", () => {
  assert.equal(
    resolveTalentWwwApexRedirect({
      method: "GET",
      currentHost: "www.sofia.studio",
      primaryActiveDomain: "sofia.studio",
    }),
    "sofia.studio",
  );
});

test("apex → www when www is primary", () => {
  assert.equal(
    resolveTalentWwwApexRedirect({
      method: "GET",
      currentHost: "sofia.studio",
      primaryActiveDomain: "www.sofia.studio",
    }),
    "www.sofia.studio",
  );
});

test("www/apex: no redirect when domain not active", () => {
  assert.equal(
    resolveTalentWwwApexRedirect({
      method: "GET",
      currentHost: "www.sofia.studio",
      primaryActiveDomain: null,
    }),
    null,
  );
});

test("counterpartWwwOrApex round-trips", () => {
  assert.equal(counterpartWwwOrApex("sofia.studio"), "www.sofia.studio");
  assert.equal(counterpartWwwOrApex("www.sofia.studio"), "sofia.studio");
});

test("talent primary-host idea matches agency helper for custom → primary", () => {
  assert.equal(talentUsesSamePrimaryHostIdeaAsAgency(), true);
  // Agency: non-primary custom → primary custom.
  assert.equal(
    resolveCanonicalCustomDomainRedirectHost({
      currentHost: "www.example.com",
      domainKind: "custom",
      isPrimary: false,
      canonicalHost: "example.com",
      canonicalHostKind: "custom",
    }),
    "example.com",
  );
  // Talent www/apex helper reaches the same primary.
  assert.equal(
    resolveTalentWwwApexRedirect({
      method: "GET",
      currentHost: "www.example.com",
      primaryActiveDomain: "example.com",
    }),
    "example.com",
  );
  // Agency: branded subdomain → primary custom (same outcome as talent subdomain helper).
  assert.equal(
    resolveCanonicalCustomDomainRedirectHost({
      currentHost: "sofia.tulala.digital",
      domainKind: "subdomain",
      isPrimary: false,
      canonicalHost: "sofia.studio",
      canonicalHostKind: "custom",
    }),
    "sofia.studio",
  );
  assert.equal(
    resolveTalentPrimaryDomainRedirect({
      surface: "subdomain",
      method: "GET",
      currentHost: "sofia.tulala.digital",
      pathname: "/x",
      search: "",
      primaryActiveDomain: "sofia.studio",
    })?.hostname,
    "sofia.studio",
  );
});
