/**
 * agency-roster-profile-url.test.ts — regression for the Phase 5 bug where
 * every agency except a single hard-coded one (Impronta) got the legacy flat
 * URL form `tulala.digital/<slug>/t/<code>`, which middleware only reaches
 * via a permanent redirect to the canonical `/w/<slug>/t/<code>` form.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  agencyRosterProfileUrl,
  platformSelfProfileUrl,
  resolveAgencyPublicOrigins,
} from "./agency-roster-profile-url";

test("hub entries always resolve to the marketing apex /t/<code>", () => {
  assert.equal(
    agencyRosterProfileUrl("any-agency", "abc123", true),
    "https://tulala.digital/t/abc123",
  );
});

test("an agency with no resolved origin falls back to the canonical /w/<slug> path form", () => {
  assert.equal(
    agencyRosterProfileUrl("morena-studio", "abc123"),
    "https://tulala.digital/w/morena-studio/t/abc123",
  );
});

test("an agency with a resolved origin uses it directly, never the path form", () => {
  assert.equal(
    agencyRosterProfileUrl("impronta", "abc123", false, "https://improntamodels.com"),
    "https://improntamodels.com/t/abc123",
  );
});

test("null/empty profile code yields no URL", () => {
  assert.equal(agencyRosterProfileUrl("acme", null), null);
  assert.equal(agencyRosterProfileUrl("acme", "  "), null);
  assert.equal(platformSelfProfileUrl(undefined), null);
});

function fakeDomainsClient(
  rows: Array<{
    tenant_id: string;
    hostname: string | null;
    kind: string;
    status: string;
    is_primary: boolean | null;
  }>,
): SupabaseClient {
  const chain: Record<string, unknown> = {
    select: () => chain,
    in: () => chain,
    then: (
      resolve: (v: { data: typeof rows; error: null }) => void,
      reject: (reason: unknown) => void,
    ) => Promise.resolve({ data: rows, error: null }).then(resolve, reject),
  };
  return { from: () => chain } as unknown as SupabaseClient;
}

test("resolveAgencyPublicOrigins prefers the primary custom domain over a subdomain", async () => {
  const client = fakeDomainsClient([
    { tenant_id: "t1", hostname: "sub.tulala.digital", kind: "subdomain", status: "active", is_primary: true },
    { tenant_id: "t1", hostname: "custom.example.com", kind: "custom", status: "active", is_primary: true },
  ]);
  const origins = await resolveAgencyPublicOrigins(client, ["t1"]);
  assert.equal(origins.get("t1"), "https://custom.example.com");
});

test("resolveAgencyPublicOrigins ignores non-ready domain rows", async () => {
  const client = fakeDomainsClient([
    { tenant_id: "t1", hostname: "pending.example.com", kind: "custom", status: "pending", is_primary: true },
  ]);
  const origins = await resolveAgencyPublicOrigins(client, ["t1"]);
  assert.equal(origins.has("t1"), false);
});

test("resolveAgencyPublicOrigins returns an empty map with no client or no tenant ids", async () => {
  assert.equal((await resolveAgencyPublicOrigins(null, ["t1"])).size, 0);
  assert.equal((await resolveAgencyPublicOrigins(fakeDomainsClient([]), [])).size, 0);
});

test("an agency with only a branded subdomain resolves to that subdomain", async () => {
  const client = fakeDomainsClient([
    {
      tenant_id: "t2",
      hostname: "morena-studio.tulala.digital",
      kind: "subdomain",
      status: "active",
      is_primary: true,
    },
  ]);
  const origins = await resolveAgencyPublicOrigins(client, ["t2"]);
  assert.equal(origins.get("t2"), "https://morena-studio.tulala.digital");
  assert.equal(
    agencyRosterProfileUrl("morena-studio", "abc123", false, origins.get("t2")),
    "https://morena-studio.tulala.digital/t/abc123",
  );
});

test("an agency with neither a custom domain nor a subdomain gets the /w/<slug> path form", async () => {
  const origins = await resolveAgencyPublicOrigins(fakeDomainsClient([]), ["t3"]);
  assert.equal(origins.has("t3"), false);
  assert.equal(
    agencyRosterProfileUrl("no-domain-agency", "abc123", false, origins.get("t3") ?? null),
    "https://tulala.digital/w/no-domain-agency/t/abc123",
  );
});

test("a domain that anon cannot route on is not offered as an origin", async () => {
  // The anon policy on `agency_domains` is USING (status = 'active'), and host
  // routing runs on the anon key, so a verified-but-not-active host 404s with
  // "Host not registered" even though host-context's own query lists it.
  for (const status of ["verified", "ssl_provisioned", "pending", "failed", "suspended"]) {
    const client = fakeDomainsClient([
      { tenant_id: "t4", hostname: "not-yet.example.com", kind: "custom", status, is_primary: true },
    ]);
    const origins = await resolveAgencyPublicOrigins(client, ["t4"]);
    assert.equal(origins.has("t4"), false, `status=${status} must not produce an origin`);
  }
});

test("a query error yields no origins rather than a wrong one", async () => {
  const chain: Record<string, unknown> = {
    select: () => chain,
    in: () => chain,
    then: (resolve: (v: { data: null; error: { message: string } }) => void) =>
      Promise.resolve({ data: null, error: { message: "denied" } }).then(resolve),
  };
  const client = { from: () => chain } as unknown as SupabaseClient;
  assert.equal((await resolveAgencyPublicOrigins(client, ["t5"])).size, 0);
});

test("an empty agency slug yields no URL instead of tulala.digital/w//t/<code>", () => {
  assert.equal(agencyRosterProfileUrl("", "abc123"), null);
  assert.equal(agencyRosterProfileUrl("   ", "abc123"), null);
  // ...but a resolved origin still works without a slug, since the slug is
  // only needed by the path form.
  assert.equal(
    agencyRosterProfileUrl("", "abc123", false, "https://acmemodels.com"),
    "https://acmemodels.com/t/abc123",
  );
});

test("the roster origin query is issued once for all tenants, never per row", async () => {
  let fromCalls = 0;
  const rows = [
    { tenant_id: "a", hostname: "a.example.com", kind: "custom", status: "active", is_primary: true },
    { tenant_id: "b", hostname: "b.example.com", kind: "custom", status: "active", is_primary: true },
    { tenant_id: "c", hostname: "c.example.com", kind: "custom", status: "active", is_primary: true },
  ];
  const chain: Record<string, unknown> = {
    select: () => chain,
    in: () => chain,
    then: (resolve: (v: { data: typeof rows; error: null }) => void) =>
      Promise.resolve({ data: rows, error: null }).then(resolve),
  };
  const client = {
    from: () => {
      fromCalls += 1;
      return chain;
    },
  } as unknown as SupabaseClient;

  const origins = await resolveAgencyPublicOrigins(client, ["a", "b", "c", "a"]);
  assert.equal(fromCalls, 1, "N+1: one agency_domains query per roster, not per row");
  assert.equal(origins.size, 3);
});
