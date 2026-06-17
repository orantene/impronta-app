import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  syncTalentSiteDomainProvisioning,
  verifyTalentSiteDomainRecord,
  type TalentSiteDomainRecord,
} from "./talent-site-domain-core";

/**
 * Minimal fake supabase client that captures the UPDATE payload written to
 * `talent_site_domains`. Only the `.from().update().eq()` chain used by the
 * core is implemented.
 */
function captureClient(): {
  client: SupabaseClient;
  read: () => Record<string, unknown> | null;
} {
  const state: { payload: Record<string, unknown> | null } = { payload: null };
  const client = {
    from() {
      return {
        update(payload: Record<string, unknown>) {
          state.payload = payload;
          return { eq: () => Promise.resolve({ error: null }) };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, read: () => state.payload };
}

function baseRecord(overrides: Partial<TalentSiteDomainRecord> = {}): TalentSiteDomainRecord {
  return {
    id: "dom-1",
    talentProfileId: "talent-1",
    domain: "example.com",
    status: "dns_verification_sent",
    verificationToken: "impronta-verify-abc",
    isPrimary: false,
    createdAt: new Date("2026-06-10T00:00:00Z").toISOString(),
    updatedAt: new Date("2026-06-10T00:00:00Z").toISOString(),
    verifiedAt: null,
    sslProvisionedAt: null,
    lastHealthCheckAt: null,
    failureReason: null,
    ...overrides,
  };
}

test("verify persists 'verified' when the TXT token matches", async () => {
  const { client, read } = captureClient();

  const transition = await verifyTalentSiteDomainRecord(client, baseRecord(), {
    txtResolver: async () => [["impronta-verify-abc"]],
  });

  assert.equal(transition.status, "verified");
  assert.equal(read()?.status, "verified");
  assert.equal(typeof read()?.verified_at, "string");
});

test("verify maps the pure 'failed' status to the talent table's 'error'", async () => {
  const { client, read } = captureClient();

  // A record whose verification window has long expired and whose TXT never
  // matched → the pure transition returns 'failed', which must persist as
  // 'error' (the talent table CHECK has no 'failed').
  const stale = baseRecord({
    createdAt: new Date("2020-01-01T00:00:00Z").toISOString(),
    updatedAt: new Date("2020-01-01T00:00:00Z").toISOString(),
  });

  const transition = await verifyTalentSiteDomainRecord(client, stale, {
    txtResolver: async () => [["something-else"]],
    now: new Date("2026-06-16T00:00:00Z"),
  });

  assert.equal(transition.status, "failed");
  assert.equal(read()?.status, "error");
});

test("sync persists 'active' when routing + HTTPS from Vercel are detected", async () => {
  const { client, read } = captureClient();

  const transition = await syncTalentSiteDomainProvisioning(
    client,
    baseRecord({ status: "verified" }),
    {
      // Apex domain → expects the Vercel A record.
      resolveARecords: async () => ["76.76.21.21"],
      resolveCnameRecords: async () => [],
      httpsProbe: async () => ({ reachable: true, fromVercel: true }),
    },
  );

  assert.equal(transition.status, "active");
  assert.equal(read()?.status, "active");
  assert.equal(typeof read()?.ssl_provisioned_at, "string");
});

test("sync holds at 'verified' while routing records are not yet live", async () => {
  const { client, read } = captureClient();

  const transition = await syncTalentSiteDomainProvisioning(
    client,
    baseRecord({ status: "verified" }),
    {
      resolveARecords: async () => [],
      resolveCnameRecords: async () => [],
      httpsProbe: async () => ({ reachable: false, fromVercel: false }),
    },
  );

  assert.equal(transition.status, "verified");
  assert.equal(read()?.status, "verified");
});
