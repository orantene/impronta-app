/**
 * In-process lifecycle: connect → verify → active → redirect (mocked Vercel).
 * Companion to the Playwright talent-website D7 spec; runs under test:wt.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveTalentPrimaryDomainRedirect } from "@/lib/saas/talent-primary-domain-redirect";

import type { TalentSiteDomainRecord } from "./talent-site-domain-core";
import {
  runCheckTalentSiteDomainProvisioning,
  runConnectTalentSiteDomain,
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
  verified_at: string | null;
  ssl_provisioned_at: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
  last_health_check_at: string | null;
  acquisition?: string;
};

function store() {
  const rows: StoreRow[] = [];
  let seq = 1;
  const client = {
    from() {
      let pendingUpdate: Record<string, unknown> | null = null;
      const filters: Record<string, unknown> = {};
      const api = {
        select: () => api,
        insert: (payload: Record<string, unknown>) => {
          rows.push({
            id: `dom-${seq++}`,
            talent_profile_id: String(payload.talent_profile_id),
            domain: String(payload.domain),
            status: String(payload.status),
            verification_token: (payload.verification_token as string) ?? null,
            is_primary: Boolean(payload.is_primary),
            verified_at: null,
            ssl_provisioned_at: null,
            failure_reason: null,
            created_at: "2026-10-09T00:00:00.000Z",
            updated_at: "2026-10-09T00:00:00.000Z",
            last_health_check_at: null,
            acquisition: payload.acquisition as string | undefined,
          });
          return Promise.resolve({ error: null });
        },
        update: (payload: Record<string, unknown>) => {
          pendingUpdate = payload;
          return api;
        },
        eq: (col: string, val: unknown) => {
          filters[col] = val;
          if (pendingUpdate) {
            for (const r of rows) {
              if (col === "id" && r.id === val) Object.assign(r, pendingUpdate);
              if (
                filters.talent_profile_id === r.talent_profile_id &&
                filters.is_primary === true &&
                pendingUpdate.is_primary === false
              ) {
                Object.assign(r, pendingUpdate);
              }
            }
            return {
              eq: (c2: string, v2: unknown) => {
                filters[c2] = v2;
                for (const r of rows) {
                  if (
                    r.talent_profile_id === filters.talent_profile_id &&
                    r.is_primary === filters.is_primary
                  ) {
                    Object.assign(r, pendingUpdate!);
                  }
                }
                return Promise.resolve({ error: null });
              },
              then: (fn: (v: { error: null }) => unknown) =>
                Promise.resolve(fn({ error: null })),
            };
          }
          return api;
        },
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return api;
    },
  };
  return { client: client as unknown as SupabaseClient, rows };
}

function asRecord(row: StoreRow): TalentSiteDomainRecord {
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

test("lifecycle: connect → verify → active → set-primary → redirect decision", async () => {
  const { client, rows } = store();
  const ctx: TalentDomainMutationCtx = { supabase: client, talentProfileId: "talent-e2e" };
  const vercelCalls: string[] = [];
  const listViews = async () => rows.map((r) => toTalentSiteDomainView(asRecord(r)));

  const connected = await runConnectTalentSiteDomain(ctx, "d7-lifecycle.test", {
    ensureOnVercel: async (d) => {
      vercelCalls.push(`attach:${d}`);
      return {
        attempted: true,
        attached: true,
        verified: false,
        alreadyExists: false,
        skippedReason: null,
        errorCode: null,
        errorMessage: null,
        challenges: [],
      };
    },
    mintVerificationToken: () => "impronta-verify-d7",
    loadDomain: async () => null,
    listViews,
  });
  assert.equal(connected.ok, true);
  assert.deepEqual(vercelCalls, ["attach:d7-lifecycle.test"]);

  const verified = await runVerifyTalentSiteDomain(ctx, "d7-lifecycle.test", {
    loadDomain: async () => asRecord(rows[0]!),
    verifyRecord: async () => {
      rows[0]!.status = "verified";
      rows[0]!.verified_at = "2026-10-09T12:00:00.000Z";
      return {
        status: "verified",
        verifiedAt: rows[0]!.verified_at,
        failureReason: null,
        lastHealthCheckAt: "2026-10-09T12:00:00.000Z",
        matchedToken: true,
        expired: false,
      };
    },
    listViews,
  });
  assert.equal(verified.ok, true);

  const active = await runCheckTalentSiteDomainProvisioning(ctx, "d7-lifecycle.test", {
    loadDomain: async () => asRecord(rows[0]!),
    syncProvisioning: async () => {
      rows[0]!.status = "active";
      rows[0]!.ssl_provisioned_at = "2026-10-09T12:05:00.000Z";
      return {
        status: "active",
        failureReason: null,
        lastHealthCheckAt: "2026-10-09T12:05:00.000Z",
        sslProvisionedAt: rows[0]!.ssl_provisioned_at,
        matchedRouting: true,
        httpsReachable: true,
        httpsFromVercel: true,
      };
    },
    listViews,
  });
  assert.equal(active.ok, true);

  const primary = await runSetPrimaryTalentSiteDomain(ctx, "d7-lifecycle.test", {
    loadDomain: async () => asRecord(rows[0]!),
    listViews,
  });
  assert.equal(primary.ok, true);
  assert.equal(rows[0]!.is_primary, true);
  assert.equal(rows[0]!.status, "active");

  const redirect = resolveTalentPrimaryDomainRedirect({
    surface: "subdomain",
    method: "GET",
    currentHost: "max-site-maxine.tulala.digital",
    pathname: "/en/book",
    search: "?ref=d7",
    primaryActiveDomain: rows[0]!.status === "active" && rows[0]!.is_primary
      ? rows[0]!.domain
      : null,
  });
  assert.deepEqual(redirect, {
    hostname: "d7-lifecycle.test",
    pathname: "/en/book",
    search: "?ref=d7",
    status: 308,
  });
});
