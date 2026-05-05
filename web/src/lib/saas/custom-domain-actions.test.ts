import test from "node:test";
import assert from "node:assert/strict";

import {
  DOMAIN_VERIFICATION_WINDOW_MS,
  ensureCustomDomainOnVercelProject,
  flattenTxtRecords,
  removeCustomDomainFromVercelProject,
  resolveDomainProvisioningTransition,
  resolveDomainVerificationTransition,
} from "./custom-domain-actions";
import {
  buildCustomDomainRoutingRecords,
  customDomainCanBecomePrimary,
  isLikelyApexCustomDomain,
} from "./custom-domain-routing";

test("flattenTxtRecords joins multi-part TXT answers", () => {
  assert.deepEqual(flattenTxtRecords([["one"], ["two", "three"]]), [
    "one",
    "twothree",
  ]);
});

test("resolveDomainVerificationTransition marks domains verified when the TXT token matches", () => {
  const now = new Date("2026-05-04T12:00:00.000Z");
  const result = resolveDomainVerificationTransition(
    {
      status: "dns_verification_sent",
      verificationToken: "impronta-verify-abc",
      createdAt: "2026-05-01T12:00:00.000Z",
      updatedAt: "2026-05-03T12:00:00.000Z",
    },
    ["impronta-verify-abc"],
    now,
  );

  assert.deepEqual(result, {
    status: "verified",
    verifiedAt: now.toISOString(),
    failureReason: null,
    lastHealthCheckAt: now.toISOString(),
    matchedToken: true,
    expired: false,
  });
});

test("resolveDomainVerificationTransition keeps domains pending while inside the verification window", () => {
  const now = new Date("2026-05-04T12:00:00.000Z");
  const result = resolveDomainVerificationTransition(
    {
      status: "dns_verification_sent",
      verificationToken: "impronta-verify-abc",
      createdAt: "2026-05-02T12:00:00.000Z",
      updatedAt: "2026-05-03T12:00:00.000Z",
    },
    [],
    now,
  );

  assert.equal(result.status, "dns_verification_sent");
  assert.equal(result.failureReason, "TXT record not found yet.");
  assert.equal(result.matchedToken, false);
  assert.equal(result.expired, false);
});

test("resolveDomainVerificationTransition fails domains after the verification window expires", () => {
  const now = new Date("2026-05-20T12:00:00.000Z");
  const result = resolveDomainVerificationTransition(
    {
      status: "dns_verification_sent",
      verificationToken: "impronta-verify-abc",
      createdAt: new Date(now.getTime() - DOMAIN_VERIFICATION_WINDOW_MS - 1000).toISOString(),
      updatedAt: null,
    },
    [],
    now,
  );

  assert.equal(result.status, "failed");
  assert.equal(
    result.failureReason,
    "TXT record not found before the 7-day verification window expired.",
  );
  assert.equal(result.matchedToken, false);
  assert.equal(result.expired, true);
});

test("resolveDomainVerificationTransition allows failed rows to recover once the TXT token appears", () => {
  const now = new Date("2026-05-20T12:00:00.000Z");
  const result = resolveDomainVerificationTransition(
    {
      status: "failed",
      verificationToken: "impronta-verify-abc",
      createdAt: "2026-05-01T12:00:00.000Z",
      updatedAt: "2026-05-10T12:00:00.000Z",
    },
    ["impronta-verify-abc"],
    now,
  );

  assert.equal(result.status, "verified");
  assert.equal(result.matchedToken, true);
  assert.equal(result.expired, false);
});

test("buildCustomDomainRoutingRecords returns an apex A record for root domains", () => {
  assert.equal(isLikelyApexCustomDomain("example.com"), true);
  assert.deepEqual(buildCustomDomainRoutingRecords("example.com"), [
    {
      type: "A",
      host: "@",
      value: "76.76.21.21",
    },
  ]);
});

test("buildCustomDomainRoutingRecords returns a CNAME for subdomains", () => {
  assert.equal(isLikelyApexCustomDomain("studio.example.com"), false);
  assert.deepEqual(buildCustomDomainRoutingRecords("studio.example.com"), [
    {
      type: "CNAME",
      host: "studio",
      value: "cname.vercel-dns-0.com",
    },
  ]);
});

test("resolveDomainProvisioningTransition stays verified until routing records are live", () => {
  const now = new Date("2026-05-05T12:00:00.000Z");
  const result = resolveDomainProvisioningTransition(
    {
      status: "verified",
      sslProvisionedAt: null,
    },
    {
      routingRecords: buildCustomDomainRoutingRecords("example.com"),
      matchedRouting: false,
      httpsReachable: false,
      httpsFromVercel: false,
    },
    now,
  );

  assert.equal(result.status, "verified");
  assert.equal(result.failureReason, "Routing records not found yet.");
  assert.equal(customDomainCanBecomePrimary(result.status), false);
});

test("resolveDomainProvisioningTransition marks routing-detected domains as ssl_provisioned", () => {
  const now = new Date("2026-05-05T12:00:00.000Z");
  const result = resolveDomainProvisioningTransition(
    {
      status: "verified",
      sslProvisionedAt: null,
    },
    {
      routingRecords: buildCustomDomainRoutingRecords("example.com"),
      matchedRouting: true,
      httpsReachable: false,
      httpsFromVercel: false,
    },
    now,
  );

  assert.equal(result.status, "ssl_provisioned");
  assert.equal(
    result.failureReason,
    "Routing detected. Waiting for HTTPS to finish provisioning on Vercel.",
  );
  assert.equal(result.sslProvisionedAt, now.toISOString());
  assert.equal(customDomainCanBecomePrimary(result.status), false);
});

test("resolveDomainProvisioningTransition marks domains active once HTTPS responds from Vercel", () => {
  const now = new Date("2026-05-05T12:00:00.000Z");
  const result = resolveDomainProvisioningTransition(
    {
      status: "ssl_provisioned",
      sslProvisionedAt: "2026-05-05T11:00:00.000Z",
    },
    {
      routingRecords: buildCustomDomainRoutingRecords("example.com"),
      matchedRouting: true,
      httpsReachable: true,
      httpsFromVercel: true,
    },
    now,
  );

  assert.equal(result.status, "active");
  assert.equal(result.failureReason, null);
  assert.equal(result.sslProvisionedAt, "2026-05-05T11:00:00.000Z");
  assert.equal(customDomainCanBecomePrimary(result.status), true);
});

test("ensureCustomDomainOnVercelProject skips when Vercel env is missing", async () => {
  const result = await ensureCustomDomainOnVercelProject("brand.example", {
    env: {},
  });

  assert.equal(result.attempted, false);
  assert.equal(result.attached, false);
  assert.equal(result.skippedReason?.includes("VERCEL_PROJECT_ID"), true);
});

test("ensureCustomDomainOnVercelProject reports attached + verified from add response", async () => {
  const calls: Array<{ url: string; method: string }> = [];
  const fetchFn = async (input: string | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
    });
    return new Response(
      JSON.stringify({
        verified: true,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  const result = await ensureCustomDomainOnVercelProject("brand.example", {
    env: {
      VERCEL_API_TOKEN: "token",
      VERCEL_PROJECT_ID: "project",
    },
    fetchFn,
  });

  assert.equal(result.attempted, true);
  assert.equal(result.attached, true);
  assert.equal(result.verified, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.method, "POST");
});

test("ensureCustomDomainOnVercelProject treats already-existing domains as attached", async () => {
  const fetchFn = async (input: string | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "POST") {
      return new Response(
        JSON.stringify({
          error: {
            code: "not_modified",
            message: 'The domain "brand.example" already exists',
          },
        }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        verified: false,
        verification: [
          {
            type: "TXT",
            domain: "_vercel.brand.example",
            value: "vc-domain-verify=abc",
            reason: "ownership check",
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  const result = await ensureCustomDomainOnVercelProject("brand.example", {
    env: {
      VERCEL_API_TOKEN: "token",
      VERCEL_PROJECT_ID: "project",
    },
    fetchFn,
  });

  assert.equal(result.attempted, true);
  assert.equal(result.attached, true);
  assert.equal(result.alreadyExists, true);
  assert.equal(result.verified, false);
  assert.equal(result.challenges.length, 1);
});

test("removeCustomDomainFromVercelProject skips when Vercel env is missing", async () => {
  const result = await removeCustomDomainFromVercelProject("brand.example", {
    env: {},
  });

  assert.equal(result.attempted, false);
  assert.equal(result.removed, false);
  assert.equal(result.skippedReason?.includes("VERCEL_PROJECT_ID"), true);
});

test("removeCustomDomainFromVercelProject treats not_found as already removed", async () => {
  const fetchFn = async () =>
    new Response(
      JSON.stringify({
        error: {
          code: "not_found",
          message: "Domain name not found",
        },
      }),
      { status: 404, headers: { "content-type": "application/json" } },
    );

  const result = await removeCustomDomainFromVercelProject("brand.example", {
    env: {
      VERCEL_API_TOKEN: "token",
      VERCEL_PROJECT_ID: "project",
    },
    fetchFn,
  });

  assert.equal(result.attempted, true);
  assert.equal(result.removed, true);
});
