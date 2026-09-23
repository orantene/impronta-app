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
