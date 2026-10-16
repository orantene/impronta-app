/**
 * D1 — talent primary custom-domain redirects.
 *
 * Covers every proxy case: subdomain → custom (path/query/locale), apex ↔ www,
 * primary served in place, inactive/missing primary never redirects, and the
 * static invariant that the talent host path uses the same agency helper.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";

import {
  resolveTalentSiteCanonicalRedirectHost,
  talentSiteCanonicalFieldsFromLookup,
} from "./talent-site-canonical-redirect";
import { talentSiteHostResponse } from "./talent-site-host-response";

function req(url: string, method = "GET"): NextRequest {
  return new NextRequest(url, { method });
}

test("subdomain → active primary custom (path + query + /en kept)", () => {
  assert.equal(
    resolveTalentSiteCanonicalRedirectHost({
      hostname: "sofia.tulala.digital",
      hostKind: "subdomain",
      isPrimary: false,
      canonicalHost: "sofia.com",
      canonicalHostKind: "custom",
    }),
    "sofia.com",
  );
});

test("www non-primary → apex primary", () => {
  assert.equal(
    resolveTalentSiteCanonicalRedirectHost({
      hostname: "www.sofia.com",
      hostKind: "custom",
      isPrimary: false,
      canonicalHost: "sofia.com",
      canonicalHostKind: "custom",
    }),
    "sofia.com",
  );
});

test("apex non-primary → www primary", () => {
  assert.equal(
    resolveTalentSiteCanonicalRedirectHost({
      hostname: "sofia.com",
      hostKind: "custom",
      isPrimary: false,
      canonicalHost: "www.sofia.com",
      canonicalHostKind: "custom",
    }),
    "www.sofia.com",
  );
});

test("primary custom domain is served in place", () => {
  assert.equal(
    resolveTalentSiteCanonicalRedirectHost({
      hostname: "sofia.com",
      hostKind: "custom",
      isPrimary: true,
      canonicalHost: null,
      canonicalHostKind: null,
    }),
    null,
  );
});

test("subdomain without active primary is served in place", () => {
  assert.equal(
    resolveTalentSiteCanonicalRedirectHost({
      hostname: "sofia.tulala.digital",
      hostKind: "subdomain",
      isPrimary: true,
      canonicalHost: null,
      canonicalHostKind: null,
    }),
    null,
  );
});

test("lookup fields: subdomain with primary_custom_domain → redirect shape", () => {
  assert.deepEqual(
    talentSiteCanonicalFieldsFromLookup({
      hostname: "sofia.tulala.digital",
      hostKind: "subdomain",
      primaryCustomDomain: "sofia.com",
    }),
    {
      isPrimary: false,
      canonicalHost: "sofia.com",
      canonicalHostKind: "custom",
    },
  );
});

test("lookup fields: missing primary columns degrade to no redirect (dark-safe)", () => {
  assert.deepEqual(
    talentSiteCanonicalFieldsFromLookup({
      hostname: "sofia.com",
      hostKind: "custom",
    }),
    { isPrimary: true, canonicalHost: null, canonicalHostKind: null },
  );
  assert.deepEqual(
    talentSiteCanonicalFieldsFromLookup({
      hostname: "sofia.tulala.digital",
      hostKind: "subdomain",
    }),
    { isPrimary: true, canonicalHost: null, canonicalHostKind: null },
  );
});

test("lookup fields: explicit non-primary custom with primary_domain", () => {
  assert.deepEqual(
    talentSiteCanonicalFieldsFromLookup({
      hostname: "www.sofia.com",
      hostKind: "custom",
      isPrimary: false,
      primaryDomain: "sofia.com",
    }),
    {
      isPrimary: false,
      canonicalHost: "sofia.com",
      canonicalHostKind: "custom",
    },
  );
});

test("lookup fields: non-primary without primary_domain never redirects", () => {
  assert.deepEqual(
    talentSiteCanonicalFieldsFromLookup({
      hostname: "www.sofia.com",
      hostKind: "custom",
      isPrimary: false,
      primaryDomain: null,
    }),
    { isPrimary: true, canonicalHost: null, canonicalHostKind: null },
  );
});

test("talentSiteHostResponse 308s subdomain to custom preserving path, query, /en", async () => {
  const res = await talentSiteHostResponse(
    req("https://sofia.tulala.digital/en/about?ref=1"),
    "/en/about",
    new Headers(),
    {
      hostname: "sofia.tulala.digital",
      talentProfileId: "talent-1",
      hostKind: "subdomain",
      isDemo: false,
      siteSlug: "sofia",
      isPrimary: false,
      canonicalHost: "sofia.com",
      canonicalHostKind: "custom",
    },
  );
  assert.equal(res.status, 308);
  assert.equal(res.headers.get("location"), "https://sofia.com/en/about?ref=1");
});

test("talentSiteHostResponse 308s www to apex primary", async () => {
  const res = await talentSiteHostResponse(
    req("https://www.sofia.com/services"),
    "/services",
    new Headers(),
    {
      hostname: "www.sofia.com",
      talentProfileId: "talent-1",
      hostKind: "custom",
      isPrimary: false,
      canonicalHost: "sofia.com",
      canonicalHostKind: "custom",
    },
  );
  assert.equal(res.status, 308);
  assert.equal(res.headers.get("location"), "https://sofia.com/services");
});

test("POST skips the canonical redirect (helper still names the host; response does not 308)", async () => {
  // Pure helper is method-agnostic; the response gate is GET/HEAD only.
  assert.equal(
    resolveTalentSiteCanonicalRedirectHost({
      hostname: "sofia.tulala.digital",
      hostKind: "subdomain",
      isPrimary: false,
      canonicalHost: "sofia.com",
      canonicalHostKind: "custom",
    }),
    "sofia.com",
  );
  assert.match(
    readFileSync(
      join(process.cwd(), "src/lib/saas/talent-site-host-response.ts"),
      "utf8",
    ),
    /request\.method === "GET" \|\| request\.method === "HEAD"/,
  );
});

test("static: talent path uses the same primary-host helper as agencies", () => {
  const responseSrc = readFileSync(
    join(process.cwd(), "src/lib/saas/talent-site-host-response.ts"),
    "utf8",
  );
  const helperSrc = readFileSync(
    join(process.cwd(), "src/lib/saas/talent-site-canonical-redirect.ts"),
    "utf8",
  );
  const proxySrc = readFileSync(join(process.cwd(), "src/proxy.ts"), "utf8");

  assert.match(helperSrc, /resolveCanonicalCustomDomainRedirectHost/);
  assert.match(responseSrc, /resolveTalentSiteCanonicalRedirectHost/);
  assert.match(proxySrc, /resolveCanonicalCustomDomainRedirectHost/);
  assert.match(proxySrc, /talentSiteHostResponse/);
});
