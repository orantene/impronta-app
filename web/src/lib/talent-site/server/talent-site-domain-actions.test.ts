/**
 * connect / verify / set-primary / remove — mutation runners with mocked Vercel.
 *
 * Run: npm run test:wt -- src/lib/talent-site/server/talent-site-domain-actions.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { VercelDomainSyncResult } from "@/lib/saas/custom-domain-actions";
import type { DomainVerificationTransition } from "@/lib/saas/custom-domain-actions";
import type { DomainProvisioningTransition } from "@/lib/saas/custom-domain-actions";

import type { TalentSiteDomainRecord } from "./talent-site-domain-core";
import {
  runCheckTalentSiteDomainProvisioning,
  runConnectTalentSiteDomain,
  runRemoveTalentSiteDomain,
  runSetPrimaryTalentSiteDomain,
  runVerifyTalentSiteDomain,
  toTalentSiteDomainView,
  type TalentDomainMutationCtx,
} from "./talent-site-domain-mutations";

type StoreRow = {
  id: string;
  talent_profile_id: string;
  domain: string;
  status: string;
  verification_token: string | null;
  is_primary: boolean;
  acquisition?: string;
  verified_at: string | null;
  ssl_provisioned_at: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
  last_health_check_at: string | null;
};

function memoryStore(seed: StoreRow[] = []) {
  const rows = [...seed];
  let seq = seed.length + 1;

  const client = {
    from(_table: string) {
      let pendingUpdate: Record<string, unknown> | null = null;
      let pendingInsert: Record<string, unknown> | null = null;
      let deleteId: string | null = null;
      const filters: Record<string, unknown> = {};

      const api = {
        select() {
          return api;
        },
        insert(payload: Record<string, unknown>): Promise<{
          error: { code: string } | null;
        }> {
          pendingInsert = payload;
          if (
            rows.some(
              (r) =>
                r.domain === payload.domain &&
                r.talent_profile_id === payload.talent_profile_id,
            )
          ) {
            return Promise.resolve({ error: { code: "23505" } });
          }
          const row: StoreRow = {
            id: `dom-${seq++}`,
            talent_profile_id: String(payload.talent_profile_id),
            domain: String(payload.domain),
            status: String(payload.status ?? "pending"),
            verification_token: (payload.verification_token as string) ?? null,
            is_primary: Boolean(payload.is_primary),
            acquisition: payload.acquisition as string | undefined,
            verified_at: (payload.verified_at as string) ?? null,
            ssl_provisioned_at: (payload.ssl_provisioned_at as string) ?? null,
            failure_reason: (payload.failure_reason as string) ?? null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_health_check_at: null,
          };
          rows.push(row);
          return Promise.resolve({ error: null });
        },
        update(payload: Record<string, unknown>) {
          pendingUpdate = payload;
          return api;
        },
        delete() {
          deleteId = "__pending__";
          return api;
        },
        eq(col: string, val: unknown) {
          filters[col] = val;
          if (pendingUpdate) {
            for (const r of rows) {
              let match = true;
              for (const [k, v] of Object.entries(filters)) {
                if ((r as Record<string, unknown>)[k] !== v) match = false;
              }
              // Also match by id when only id filter set after update().eq("id")
              if (col === "id" && r.id === val) {
                Object.assign(r, pendingUpdate, { updated_at: new Date().toISOString() });
              } else if (match && Object.keys(filters).length > 0 && col !== "id") {
                // demote path: talent_profile_id + is_primary
                if (
                  filters.talent_profile_id === r.talent_profile_id &&
                  filters.is_primary === r.is_primary
                ) {
                  Object.assign(r, pendingUpdate);
                }
              }
            }
            if (col === "id") {
              const r = rows.find((x) => x.id === val);
              if (r) Object.assign(r, pendingUpdate);
              const done = { error: null };
              return {
                eq: () => Promise.resolve(done),
                then: (fn: (v: typeof done) => unknown) => Promise.resolve(fn(done)),
              };
            }
            return {
              eq: (col2: string, val2: unknown) => {
                filters[col2] = val2;
                for (const r of rows) {
                  if (
                    r.talent_profile_id === filters.talent_profile_id &&
                    r.is_primary === filters.is_primary
                  ) {
                    Object.assign(r, pendingUpdate);
                  }
                }
                return Promise.resolve({ error: null });
              },
              then: (fn: (v: { error: null }) => unknown) =>
                Promise.resolve(fn({ error: null })),
            };
          }
          if (deleteId === "__pending__" && col === "id") {
            const idx = rows.findIndex((r) => r.id === val);
            if (idx >= 0) rows.splice(idx, 1);
            return Promise.resolve({ error: null });
          }
          return api;
        },
        maybeSingle: async () => {
          const found = rows.find((r) => {
            if (filters.domain && r.domain !== filters.domain) return false;
            if (
              filters.talent_profile_id &&
              r.talent_profile_id !== filters.talent_profile_id
            ) {
              return false;
            }
            if (filters.id && r.id !== filters.id) return false;
            return true;
          });
          return { data: found ?? null, error: null };
        },
      };
      void pendingInsert;

      return api;
    },
  };

  return { client: client as unknown as SupabaseClient, rows };
}

function recordFrom(row: StoreRow): TalentSiteDomainRecord {
  return {
    id: row.id,
    talentProfileId: row.talent_profile_id,
    domain: row.domain,
    status: row.status as TalentSiteDomainRecord["status"],
    verificationToken: row.verification_token,
    isPrimary: row.is_primary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    verifiedAt: row.verified_at,
    sslProvisionedAt: row.ssl_provisioned_at,
    lastHealthCheckAt: row.last_health_check_at,
    failureReason: row.failure_reason,
  };
}

const vercelOk: VercelDomainSyncResult = {
  attempted: true,
  attached: true,
  verified: false,
  alreadyExists: false,
  skippedReason: null,
  errorCode: null,
  errorMessage: null,
  challenges: [],
};

test("connect inserts dns_verification_sent + calls mocked Vercel attach", async () => {
  const { client, rows } = memoryStore();
  const ctx: TalentDomainMutationCtx = { supabase: client, talentProfileId: "talent-1" };
  const vercelCalls: string[] = [];

  const result = await runConnectTalentSiteDomain(ctx, "Studio.Example.com", {
    ensureOnVercel: async (d) => {
      vercelCalls.push(d);
      return vercelOk;
    },
    mintVerificationToken: () => "impronta-verify-abc",
    loadDomain: async () => null,
    listViews: async () => rows.map((r) => toTalentSiteDomainView(recordFrom(r))),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(vercelCalls, ["studio.example.com"]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.domain, "studio.example.com");
  assert.equal(rows[0]!.status, "dns_verification_sent");
  assert.equal(rows[0]!.verification_token, "impronta-verify-abc");
  assert.equal(rows[0]!.acquisition, "connected");
});

test("verify advances to verified when TXT matcher succeeds", async () => {
  const seed: StoreRow = {
    id: "dom-1",
    talent_profile_id: "talent-1",
    domain: "studio.example.com",
    status: "dns_verification_sent",
    verification_token: "impronta-verify-abc",
    is_primary: false,
    verified_at: null,
    ssl_provisioned_at: null,
    failure_reason: null,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    last_health_check_at: null,
  };
  const { client, rows } = memoryStore([seed]);
  const ctx: TalentDomainMutationCtx = { supabase: client, talentProfileId: "talent-1" };

  const result = await runVerifyTalentSiteDomain(ctx, "studio.example.com", {
    loadDomain: async () => recordFrom(rows[0]!),
    verifyRecord: async (_sb, record) => {
      rows[0]!.status = "verified";
      rows[0]!.verified_at = "2026-10-09T00:00:00.000Z";
      const transition: DomainVerificationTransition = {
        status: "verified",
        verifiedAt: rows[0]!.verified_at,
        failureReason: null,
        lastHealthCheckAt: "2026-10-09T00:00:00.000Z",
        matchedToken: true,
        expired: false,
      };
      void record;
      return transition;
    },
    listViews: async () => rows.map((r) => toTalentSiteDomainView(recordFrom(r))),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.message, /verified/i);
  assert.equal(rows[0]!.status, "verified");
});

test("check provisioning → active (mocked)", async () => {
  const seed: StoreRow = {
    id: "dom-1",
    talent_profile_id: "talent-1",
    domain: "studio.example.com",
    status: "verified",
    verification_token: "impronta-verify-abc",
    is_primary: false,
    verified_at: "2026-10-09T00:00:00.000Z",
    ssl_provisioned_at: null,
    failure_reason: null,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-09T00:00:00.000Z",
    last_health_check_at: null,
  };
  const { client, rows } = memoryStore([seed]);
  const ctx: TalentDomainMutationCtx = { supabase: client, talentProfileId: "talent-1" };

  const result = await runCheckTalentSiteDomainProvisioning(ctx, "studio.example.com", {
    loadDomain: async () => recordFrom(rows[0]!),
    syncProvisioning: async () => {
      rows[0]!.status = "active";
      rows[0]!.ssl_provisioned_at = "2026-10-09T01:00:00.000Z";
      const transition: DomainProvisioningTransition = {
        status: "active",
        failureReason: null,
        lastHealthCheckAt: "2026-10-09T01:00:00.000Z",
        sslProvisionedAt: rows[0]!.ssl_provisioned_at,
        matchedRouting: true,
        httpsReachable: true,
        httpsFromVercel: true,
      };
      return transition;
    },
    listViews: async () => rows.map((r) => toTalentSiteDomainView(recordFrom(r))),
  });

  assert.equal(result.ok, true);
  assert.equal(rows[0]!.status, "active");
});

test("set-primary promotes active domain and demotes previous", async () => {
  const { client, rows } = memoryStore([
    {
      id: "dom-old",
      talent_profile_id: "talent-1",
      domain: "old.example.com",
      status: "active",
      verification_token: null,
      is_primary: true,
      verified_at: "2026-10-01T00:00:00.000Z",
      ssl_provisioned_at: "2026-10-01T00:00:00.000Z",
      failure_reason: null,
      created_at: "2026-10-01T00:00:00.000Z",
      updated_at: "2026-10-01T00:00:00.000Z",
      last_health_check_at: null,
    },
    {
      id: "dom-new",
      talent_profile_id: "talent-1",
      domain: "studio.example.com",
      status: "active",
      verification_token: null,
      is_primary: false,
      verified_at: "2026-10-09T00:00:00.000Z",
      ssl_provisioned_at: "2026-10-09T00:00:00.000Z",
      failure_reason: null,
      created_at: "2026-10-09T00:00:00.000Z",
      updated_at: "2026-10-09T00:00:00.000Z",
      last_health_check_at: null,
    },
  ]);
  const ctx: TalentDomainMutationCtx = { supabase: client, talentProfileId: "talent-1" };

  const result = await runSetPrimaryTalentSiteDomain(ctx, "studio.example.com", {
    loadDomain: async () => recordFrom(rows.find((r) => r.domain === "studio.example.com")!),
    listViews: async () => rows.map((r) => toTalentSiteDomainView(recordFrom(r))),
  });

  assert.equal(result.ok, true);
  assert.equal(rows.find((r) => r.domain === "studio.example.com")!.is_primary, true);
  assert.equal(rows.find((r) => r.domain === "old.example.com")!.is_primary, false);
});

test("set-primary refuses non-active domain", async () => {
  const { client, rows } = memoryStore([
    {
      id: "dom-1",
      talent_profile_id: "talent-1",
      domain: "studio.example.com",
      status: "verified",
      verification_token: "t",
      is_primary: false,
      verified_at: "2026-10-09T00:00:00.000Z",
      ssl_provisioned_at: null,
      failure_reason: null,
      created_at: "2026-10-01T00:00:00.000Z",
      updated_at: "2026-10-09T00:00:00.000Z",
      last_health_check_at: null,
    },
  ]);
  const ctx: TalentDomainMutationCtx = { supabase: client, talentProfileId: "talent-1" };

  const result = await runSetPrimaryTalentSiteDomain(ctx, "studio.example.com", {
    loadDomain: async () => recordFrom(rows[0]!),
    listViews: async () => rows.map((r) => toTalentSiteDomainView(recordFrom(r))),
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /must finish routing/i);
});

test("remove deletes row and calls mocked Vercel detach", async () => {
  const { client, rows } = memoryStore([
    {
      id: "dom-1",
      talent_profile_id: "talent-1",
      domain: "studio.example.com",
      status: "active",
      verification_token: null,
      is_primary: true,
      verified_at: "2026-10-09T00:00:00.000Z",
      ssl_provisioned_at: "2026-10-09T00:00:00.000Z",
      failure_reason: null,
      created_at: "2026-10-01T00:00:00.000Z",
      updated_at: "2026-10-09T00:00:00.000Z",
      last_health_check_at: null,
    },
  ]);
  const ctx: TalentDomainMutationCtx = { supabase: client, talentProfileId: "talent-1" };
  const removed: string[] = [];

  const result = await runRemoveTalentSiteDomain(ctx, "studio.example.com", {
    loadDomain: async () => recordFrom(rows[0]!),
    removeFromVercel: async (d) => {
      removed.push(d);
      return {
        attempted: true,
        removed: true,
        skippedReason: null,
        errorCode: null,
        errorMessage: null,
      };
    },
    listViews: async () => rows.map((r) => toTalentSiteDomainView(recordFrom(r))),
  });

  assert.equal(result.ok, true);
  assert.equal(rows.length, 0);
  assert.deepEqual(removed, ["studio.example.com"]);
});
