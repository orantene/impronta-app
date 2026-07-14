/**
 * scope.security.test.ts — SECURITY characterization of tenant-scope resolution.
 *
 * Scope: src/lib/saas/scope.ts — the single read-side choke point for
 * "which tenant is this request acting on". Companion to the existing
 * scope.test.ts (which only covers resolveTenantFromHost happy paths).
 *
 * This file does NOT fix anything. It snapshots CURRENT authz behaviour so a
 * later refactor that weakens tenant isolation fails loudly. Two techniques,
 * matching repo convention:
 *
 *   1. Behavioural tests for the one param-injectable function
 *      (resolveTenantFromHost) — the same mock-supabase pattern as
 *      scope.test.ts.
 *   2. Source-level invariants (readFileSync + assert.match) for the
 *      header/cookie/session-coupled functions that cannot be unit-tested on
 *      Node 20 without experimental module mocking — the exact pattern
 *      blessed by tenant-isolation.test.ts.
 *
 * Cases where isolation looks WEAK are marked `{ skip: "SECURITY FLAG: …" }`
 * so they surface loudly in the test run and the agent report. Skipped tests
 * still assert the *current* (weak) behaviour — they are characterizations,
 * not aspirations — and the comment states the hardened behaviour we'd want.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveTenantFromHost } from "./scope";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const SCOPE_SRC = readFileSync(join(HERE, "scope.ts"), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// Mock supabase — chainable, records the filters applied. Mirrors the shape
// used by scope.test.ts / admin-scope.test.ts so strict-mode typing matches.
// ─────────────────────────────────────────────────────────────────────────────
type QueryCall = {
  table: string;
  eqs: Array<[string, string]>;
  ins: Array<[string, unknown[]]>;
  limits: number[];
  result: { data: unknown; error: null | { message: string } };
};

function mockSupabase(result: QueryCall["result"]) {
  const calls: QueryCall[] = [];
  const supabase = {
    from(table: string) {
      const call: QueryCall = { table, eqs: [], ins: [], limits: [], result };
      calls.push(call);
      const chain = {
        select() {
          return chain;
        },
        eq(col: string, val: string) {
          call.eqs.push([col, val]);
          return chain;
        },
        in(col: string, vals: unknown[]) {
          call.ins.push([col, vals]);
          return chain;
        },
        limit(n: number) {
          call.limits.push(n);
          return chain;
        },
        maybeSingle() {
          return Promise.resolve(call.result);
        },
      };
      return chain;
    },
  } as unknown as SupabaseClient;
  return { supabase, calls };
}

/** A supabase whose query builder throws synchronously when `.from()` runs. */
function throwingSupabase(): SupabaseClient {
  return {
    from() {
      throw new Error("simulated driver crash");
    },
  } as unknown as SupabaseClient;
}

// ─────────────────────────────────────────────────────────────────────────────
// resolveTenantFromHost — anonymous public-storefront tenant binding. Every
// anon request's tenant scope flows from here, so its failure modes ARE the
// tenant-isolation boundary for unauthenticated traffic.
// ─────────────────────────────────────────────────────────────────────────────

test("resolveTenantFromHost: the DB row's hostname/tenant is authoritative, not the request host", async () => {
  // Even if the caller passes a host string, the binding returned is the one
  // stored in agency_domains for that row — request input never becomes the
  // tenant key directly.
  const { supabase } = mockSupabase({
    data: { tenant_id: "tenant-REAL", hostname: "canonical.brand.mx", status: "active" },
    error: null,
  });
  const res = await resolveTenantFromHost(supabase, "canonical.brand.mx");
  assert.deepEqual(res, { tenantId: "tenant-REAL", hostname: "canonical.brand.mx" });
});

test("resolveTenantFromHost: trailing-dot FQDN is NOT normalised — fails closed (no match)", async () => {
  // `.trim().toLowerCase()` does not strip a trailing dot. "brand.mx." will be
  // queried verbatim and (since agency_domains stores "brand.mx") not match.
  // Documented as a fail-CLOSED gap: a tampered FQDN host yields no tenant
  // rather than the wrong tenant. (Hardened behaviour would also strip the
  // trailing dot so the canonical host still resolves — availability, not a
  // confidentiality bug.)
  const { supabase, calls } = mockSupabase({ data: null, error: null });
  const res = await resolveTenantFromHost(supabase, "brand.mx.");
  assert.equal(res, null);
  assert.equal(calls[0].eqs[0][1], "brand.mx.", "trailing dot is passed through verbatim");
});

test("resolveTenantFromHost: internal whitespace is preserved (only ends trimmed) — fails closed", async () => {
  const { supabase, calls } = mockSupabase({ data: null, error: null });
  const res = await resolveTenantFromHost(supabase, "  br and.mx  ");
  assert.equal(res, null);
  assert.equal(calls[0].eqs[0][1], "br and.mx", "ends trimmed, internal space kept → no cross-tenant match");
});

test("resolveTenantFromHost: host:port is NOT stripped — fails closed", async () => {
  const { supabase, calls } = mockSupabase({ data: null, error: null });
  const res = await resolveTenantFromHost(supabase, "brand.mx:443");
  assert.equal(res, null);
  assert.equal(calls[0].eqs[0][1], "brand.mx:443");
});

test("resolveTenantFromHost: status allow-list is exactly [active, ssl_provisioned, verified] with limit(1)+maybeSingle()", async () => {
  // Pinning the allow-list: a row in any other lifecycle state (pending,
  // dns_pending, disabled, removed) must never bind a tenant. limit(1) +
  // maybeSingle() also pins "no ambiguous multi-row resolution".
  const { supabase, calls } = mockSupabase({
    data: { tenant_id: "t", hostname: "brand.mx", status: "active" },
    error: null,
  });
  await resolveTenantFromHost(supabase, "brand.mx");
  assert.deepEqual(calls[0].ins, [["status", ["active", "ssl_provisioned", "verified"]]]);
  assert.deepEqual(calls[0].limits, [1]);
});

test("resolveTenantFromHost: a synchronous driver throw is caught → null, NO seed fallback", async () => {
  // Fail-hard (Plan L37): on any internal failure the resolver returns null so
  // middleware serves marketing/404, never silently binds tenant #1.
  const res = await resolveTenantFromHost(throwingSupabase(), "brand.mx");
  assert.equal(res, null);
});

test(
  "resolveTenantFromHost: a malformed agency_domains row with empty tenant_id is REJECTED (fail-closed) [HARDENED 2026-05-19]",
  async () => {
    // HARDENING: empty / null / whitespace-only tenant_id is now rejected at
    // the resolver before becoming `.eq('tenant_id', '')` downstream.
    for (const bad of ["", "   ", null, undefined]) {
      const { supabase } = mockSupabase({
        data: { tenant_id: bad, hostname: "brand.mx", status: "active" },
        error: null,
      });
      const res = await resolveTenantFromHost(supabase, "brand.mx");
      assert.equal(
        res,
        null,
        `tenant_id=${JSON.stringify(bad)} must be rejected (returned null)`,
      );
    }
  },
);

test("resolveTenantFromHost: whitespace-wrapped tenant_id is trimmed before being returned (no junk leak)", async () => {
  // A well-formed UUID with stray whitespace shouldn't reach downstream
  // query builders untrimmed — they'd then construct a junk equality filter
  // and silently return zero rows for legitimate tenants.
  const { supabase } = mockSupabase({
    data: {
      tenant_id: "  tenant-REAL  ",
      hostname: "brand.mx",
      status: "active",
    },
    error: null,
  });
  const res = await resolveTenantFromHost(supabase, "brand.mx");
  assert.deepEqual(res, { tenantId: "tenant-REAL", hostname: "brand.mx" });
});

// ─────────────────────────────────────────────────────────────────────────────
// Source-level isolation invariants — for getTenantScope / getPublicTenantScope
// / getPublicPathPrefix / getTenantScopeBySlug. These are coupled to
// next/headers + cookies() + the cached actor session and cannot be unit-tested
// on Node 20 (mock.module is 22.3+). We pin their security contract structurally
// instead — the tenant-isolation.test.ts pattern.
// ─────────────────────────────────────────────────────────────────────────────

test("INVARIANT getTenantScope: tampered tenant cookie is rejected + audit-logged (no silent downgrade)", () => {
  // Plan M3 exit criterion. The choke point: when the preferred (cookie/header)
  // tenant id is NOT one of the actor's memberships, getTenantScope must emit a
  // security log AND return null — it must NOT fall back to a default tenant.
  assert.match(
    SCOPE_SRC,
    /security\.tenant_cookie_tamper/,
    "getTenantScope must log security.tenant_cookie_tamper on a non-member preferred tenant",
  );
  // The mismatch branch returns null (fail-hard), not pickDefault().
  const branch = SCOPE_SRC.slice(
    SCOPE_SRC.indexOf("if (preferred) {"),
    SCOPE_SRC.indexOf("const chosen = pickDefault"),
  );
  assert.ok(branch.length > 0, "preferred-tenant branch located");
  assert.match(branch, /improntaLog\("security\.tenant_cookie_tamper"/);
  assert.match(
    branch,
    /return null;\s*\n\s*}\s*\n/,
    "the cookie-tamper branch must return null (no downgrade to pickDefault)",
  );
});

test("INVARIANT scope.ts: no runtime seed-tenant fallback (no LEGACY id / all-ones / all-twos UUID)", () => {
  // Extends the tenant-isolation.test.ts LEGACY_TENANT_ID invariant to scope.ts
  // specifically: the read-side resolver must never hardcode a tenant.
  assert.doesNotMatch(SCOPE_SRC, /LEGACY_TENANT_ID/, "scope.ts must not reference the seed tenant");
  assert.doesNotMatch(
    SCOPE_SRC,
    /00000000-0000-0000-0000-0000000000(01|02)/,
    "scope.ts must not hardcode the seed/hub tenant UUID as a fallback",
  );
});

test("INVARIANT getPublicPathPrefix: slug is validated with an anchored ^/[a-z0-9][a-z0-9-]{1,62}$ regex", () => {
  // This regex is the path-injection guard for /<tenantSlug>/ storefront
  // routing on hub/marketing hosts. Anchored + lowercased alnum/hyphen only →
  // rejects "/../", protocol-relative "//evil", uppercase, empty, over-length.
  assert.match(
    SCOPE_SRC,
    /\/\^\\\/\[a-z0-9\]\[a-z0-9-\]\{1,62\}\$\//,
    "getPublicPathPrefix must keep the anchored slug regex",
  );
});

test("INVARIANT getPublicTenantScope: trusts ONLY the x-impronta-tenant-id header, returns null when absent", () => {
  const fn = SCOPE_SRC.slice(
    SCOPE_SRC.indexOf("export async function getPublicTenantScope"),
    SCOPE_SRC.indexOf("export async function getPublicTenantScope") + 400,
  );
  assert.ok(fn.length > 0, "getPublicTenantScope located");
  assert.match(fn, /headers\(\)\)\.get\(ACTIVE_TENANT_HEADER\)/);
  assert.match(fn, /if \(!tenantId\) return null;/, "no header → null (no default tenant)");
  assert.doesNotMatch(fn, /cookies\(\)/, "must NOT read cookies for the public tenant scope");
  assert.doesNotMatch(fn, /searchParams|nextUrl|req\.url/, "must NOT read request URL/query for tenant binding");
});

test("INVARIANT getTenantScopeBySlug: proves an agency_membership (no service-role bypass)", () => {
  const fn = SCOPE_SRC.slice(
    SCOPE_SRC.indexOf("export const getTenantScopeBySlug"),
    SCOPE_SRC.indexOf("export type TenantPortalScope"),
  );
  assert.ok(fn.length > 0, "getTenantScopeBySlug located");
  assert.match(fn, /getCurrentUserTenants\(\)/, "must resolve from the actor's memberships");
  assert.match(fn, /memberships\.find\(\(m\) => m\.slug === slug\)/);
  assert.match(fn, /if \(!membership\) return null;/, "unknown/non-member slug → null");
  assert.doesNotMatch(
    fn,
    /createServiceRoleClient/,
    "staff slug→tenant resolution must NOT use the RLS-bypassing service-role client",
  );
});

test(
  "getPublicTenantScope UUID-validates the header before trusting it (defence-in-depth over proxy.ts strip) [HARDENED 2026-05-19]",
  () => {
    const fn = SCOPE_SRC.slice(
      SCOPE_SRC.indexOf("export async function getPublicTenantScope"),
      SCOPE_SRC.indexOf("export async function getPublicTenantScope") + 1200,
    );
    assert.ok(fn.length > 0, "getPublicTenantScope located");
    // HARDENING: the header is now parsed through a UUID schema and rejected
    // on failure. The proxy.ts strip remains the primary defence — this is
    // the second, position-independent layer.
    assert.match(fn, /TENANT_ID_SCHEMA\.safeParse\(tenantId\)/, "UUID-validates the header value");
    assert.match(fn, /if \(!parsed\.success\)/, "invalid header → rejected branch");
    assert.match(
      fn,
      /security\.public_tenant_header_invalid/,
      "rejected header emits a structured security audit line",
    );
    assert.match(fn, /return null;/, "invalid header → null (no scope leak)");
    assert.match(
      fn,
      /return \{ tenantId: parsed\.data \};/,
      "happy path returns the parsed (validated) value, not the raw header",
    );
  },
);

test("INVARIANT TENANT_ID_SCHEMA: header tenant-id values must validate as UUID shape", () => {
  // Pin the schema shape so a later refactor that loosens it (e.g. to a
  // generic string) regresses loudly. The legitimate path always writes a
  // Postgres UUID; nothing else should pass.
  //
  // DELIBERATELY shape-only (`z.string().regex(8-4-4-4-12 hex)`), NOT
  // `z.string().uuid()`: zod 4's `.uuid()` also enforces the RFC-4122
  // version/variant nibbles, which the seeded placeholder tenant ids
  // (e.g. 00000000-0000-0000-0000-000000000001) do not satisfy — that
  // over-strict check silently dropped tenant scope on every storefront.
  assert.match(
    SCOPE_SRC,
    /const TENANT_ID_SCHEMA = z\s*\.string\(\)\s*\.regex\(/,
    "TENANT_ID_SCHEMA must remain a shape-only UUID regex (not z.string().uuid(), which rejects seed ids)",
  );
});

test(
  "getTenantPortalScopeBySlug proves a caller-relationship (host context OR membership/talent/client row) inside the helper [HARDENED 2026-05-19]",
  () => {
    const fn = SCOPE_SRC.slice(
      SCOPE_SRC.indexOf("export const getTenantPortalScopeBySlug"),
      SCOPE_SRC.indexOf("export async function resolveTenantFromHost"),
    );
    assert.ok(fn.length > 0, "getTenantPortalScopeBySlug located");
    // Service-role lookup + agency-status gate retained (resolution still
    // bypasses RLS — the new check is layered on top, not a replacement).
    assert.match(fn, /createServiceRoleClient\(\)/, "still uses service-role for the slug→tenant lookup");
    assert.match(fn, /status === "cancelled" \|\| .*status === "archived"/);
    // HARDENING: the helper now calls the relationship-proof helper before
    // returning the scope, and emits a structured security log + null on
    // rejection. (The relationship-proof helper itself queries
    // agency_memberships / agency_client_relationships / agency_talent_roster
    // — pinned by the dedicated invariants below.)
    assert.match(
      fn,
      /callerHasRelationshipToTenant\(admin, data\.id\)/,
      "relationship proof is invoked inside the helper, not delegated to callers",
    );
    assert.match(
      fn,
      /security\.portal_scope_unrelated_caller/,
      "rejected callers must emit a structured security audit line",
    );
    assert.match(
      fn,
      /if \(!related\) \{[\s\S]*?return null;\s*\}/,
      "no-relationship branch returns null (no scope leak)",
    );
  },
);

test("INVARIANT callerHasRelationshipToTenant: accepts matching public host context (agency/hub) without an authed user", () => {
  // The host-context check is the only allow path for anonymous callers; if
  // middleware bound this same tenantId via verified agency_domains, the host
  // is itself the relationship proof.
  const helper = SCOPE_SRC.slice(
    SCOPE_SRC.indexOf("async function callerHasRelationshipToTenant"),
    SCOPE_SRC.length,
  );
  assert.ok(helper.length > 0, "callerHasRelationshipToTenant located");
  assert.match(helper, /getPublicHostContext\(\)/, "reads the verified host context");
  assert.match(
    helper,
    /hostContext\.kind === "agency" \|\| hostContext\.kind === "hub"/,
    "only the tenant-bound kinds count as proof",
  );
  assert.match(
    helper,
    /hostContext\.tenantId === tenantId/,
    "host must match the resolved tenantId — not a different tenant",
  );
});

test("INVARIANT callerHasRelationshipToTenant: signed-in path checks all three relationship tables, scoped by tenantId AND actor", () => {
  const helper = SCOPE_SRC.slice(
    SCOPE_SRC.indexOf("async function callerHasRelationshipToTenant"),
    SCOPE_SRC.length,
  );
  assert.match(helper, /getCachedActorSession\(\)/, "resolves the actor via the cached session");
  assert.match(helper, /if \(!userId\) return false;/, "anonymous + no host match → deny");
  // Each relationship table: queried with BOTH tenant_id AND user-key filters.
  // (Pinning the AND keeps a future refactor from accidentally widening the
  // existence check across tenants.)
  for (const table of [
    "agency_memberships",
    "client_profiles",
    "agency_client_relationships",
    "talent_profiles",
    "agency_talent_roster",
  ]) {
    assert.ok(
      helper.includes(`"${table}"`),
      `relationship helper must query ${table}`,
    );
  }
  assert.match(
    helper,
    /\.from\("agency_memberships"\)[\s\S]*?\.eq\("tenant_id", tenantId\)[\s\S]*?\.eq\("profile_id", userId\)/,
    "agency_memberships scoped by tenant_id AND profile_id",
  );
  assert.match(
    helper,
    /\.from\("agency_client_relationships"\)[\s\S]*?\.eq\("tenant_id", tenantId\)[\s\S]*?client_profile_id/,
    "agency_client_relationships scoped by tenant_id AND client_profile_id",
  );
  assert.match(
    helper,
    /\.from\("agency_talent_roster"\)[\s\S]*?\.eq\("tenant_id", tenantId\)[\s\S]*?talent_profile_id/,
    "agency_talent_roster scoped by tenant_id AND talent_profile_id",
  );
});
