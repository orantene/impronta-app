/**
 * D7 — connect → verify → active → redirect (mocked Vercel).
 *
 * Runs on the talent-website isolated stack (same fixtures as j4). The mutation
 * chain is in-process with a fake Supabase + mocked Vercel attach (no live
 * VERCEL_* calls). When TALENT_SITE_E2E_FIXTURE_READY=1, also asserts the pure
 * redirect decision for the t_max fixture's custom domain.
 *
 * Gate: set TALENT_SITE_E2E_FIXTURE_READY=1 after seed.ts (CI does this).
 */
import { test, expect } from "@playwright/test";

import { resolveTalentPrimaryDomainRedirect } from "../../src/lib/saas/talent-primary-domain-redirect";
import type { TalentSiteDomainRecord } from "../../src/lib/talent-site/server/talent-site-domain-core";
import {
  runCheckTalentSiteDomainProvisioning,
  runConnectTalentSiteDomain,
  runSetPrimaryTalentSiteDomain,
  runVerifyTalentSiteDomain,
  toTalentSiteDomainView,
  type TalentDomainMutationCtx,
} from "../../src/lib/talent-site/server/talent-site-domain-mutations";

import { talentFixture } from "./fixtures";
import { TALENT_SITE_FIXTURE_READY } from "./helpers";

const T_MAX = talentFixture("t_max");

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
};

function makeStore() {
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
          });
          return Promise.resolve({ error: null });
        },
        update: (payload: Record<string, unknown>) => {
          pendingUpdate = payload;
          return api;
        },
        eq: (col: string, val: unknown) => {
          filters[col] = val;
          if (!pendingUpdate) return api;
          if (col === "id") {
            const r = rows.find((x) => x.id === val);
            if (r) Object.assign(r, pendingUpdate);
            return Promise.resolve({ error: null });
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
          };
        },
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return api;
    },
  };
  return { client, rows };
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

test.beforeEach(() => {
  test.skip(!TALENT_SITE_FIXTURE_READY, "set TALENT_SITE_E2E_FIXTURE_READY=1 after seed.ts");
});

test("D7 connect → verify → active → redirect (mocked Vercel)", async () => {
  const { client, rows } = makeStore();
  const ctx: TalentDomainMutationCtx = {
    supabase: client as never,
    talentProfileId: "talent-d7-e2e",
  };
  const listViews = async () => rows.map((r) => toTalentSiteDomainView(asRecord(r)));
  const domain = T_MAX.customDomain ?? "max-site.test";
  const vercelCalls: string[] = [];

  const connected = await runConnectTalentSiteDomain(ctx, domain, {
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
    mintVerificationToken: () => "impronta-verify-d7-e2e",
    loadDomain: async () => null,
    listViews,
  });
  expect(connected.ok).toBeTruthy();
  expect(vercelCalls).toEqual([`attach:${domain}`]);

  const verified = await runVerifyTalentSiteDomain(ctx, domain, {
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
  expect(verified.ok).toBeTruthy();

  const active = await runCheckTalentSiteDomainProvisioning(ctx, domain, {
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
  expect(active.ok).toBeTruthy();

  const primary = await runSetPrimaryTalentSiteDomain(ctx, domain, {
    loadDomain: async () => asRecord(rows[0]!),
    listViews,
  });
  expect(primary.ok).toBeTruthy();
  expect(rows[0]!.is_primary).toBe(true);
  expect(rows[0]!.status).toBe("active");

  const redirect = resolveTalentPrimaryDomainRedirect({
    surface: "subdomain",
    method: "GET",
    currentHost: `${T_MAX.siteSlug}.tulala.digital`,
    pathname: "/en/book",
    search: "?ref=d7",
    primaryActiveDomain: domain,
  });
  expect(redirect).toEqual({
    hostname: domain,
    pathname: "/en/book",
    search: "?ref=d7",
    status: 308,
  });

  const hub = resolveTalentPrimaryDomainRedirect({
    surface: "hub",
    method: "GET",
    currentHost: "tulala.digital",
    pathname: `/t/${T_MAX.profileCode}`,
    search: "",
    primaryActiveDomain: domain,
  });
  expect(hub).toEqual({
    hostname: domain,
    pathname: "/",
    search: "",
    status: 308,
  });
});
