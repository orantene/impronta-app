// public-profile-override-tenant.test.ts
//
// The public profile (/t/[profileCode]) resolves ONE tenant and keys every
// override-driven read on it: field VALUES, category (taxonomy) visibility, and
// sidebar SECTION visibility. Before this test's fix the section gates were
// keyed on `hostCtx.tenantId`, which on the hub host is the HUB AGENCY's own
// tenant — a tenant with no authority over a roster talent — while the values
// inside those sections came from the roster tenant. Hub and tenant host could
// therefore render different sections for the same profile.
//
// These tests pin the three properties that fix depends on:
//   1. hub host and tenant host resolve to the SAME tenant (agreement),
//   2. a talent on no active roster resolves to null (canonical defaults),
//   3. a talent on MULTIPLE tenants resolves deterministically (primary first,
//      then oldest roster row, then id) — so the hub cannot flip between
//      tenants across requests or across the visibility cache TTL.
//
// Run: npx tsx --test src/lib/saas/public-profile-override-tenant.test.ts
// Wired into `npm run test:tenant-isolation` (→ CI "Structural quality gate").

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  resolveGoverningTenantIdForTalent,
  resolvePublicProfileOverrideTenantId,
} from "@/lib/saas/talent-roster";

type RosterRow = {
  tenant_id: string;
  is_primary: boolean;
  added_at: string;
  id: string;
  status: "active" | "pending" | "inactive" | "removed";
};

type Recorded = {
  table: string | null;
  filters: Array<[string, unknown]>;
  orders: Array<[string, boolean]>;
  limit: number | null;
};

/**
 * Minimal PostgREST-shaped stub. It applies the `.eq()` filters and the
 * `.order()` sequence itself, so the test asserts on the REAL ordering the
 * production query asks Postgres for, not on a hand-sorted fixture.
 */
function stubClient(
  rows: RosterRow[],
  opts: { error?: boolean } = {},
): { client: SupabaseClient; recorded: Recorded } {
  const recorded: Recorded = {
    table: null,
    filters: [],
    orders: [],
    limit: null,
  };
  let working = [...rows];

  const builder = {
    select() {
      return builder;
    },
    eq(col: string, val: unknown) {
      recorded.filters.push([col, val]);
      // Fixture rows carry only the columns under test; a filter on a column
      // the fixture does not model (talent_profile_id) is a no-op here — the
      // recorded filter list is what the test asserts on for those.
      working = working.filter((r) => {
        const row = r as unknown as Record<string, unknown>;
        return col in row ? row[col] === val : true;
      });
      return builder;
    },
    order(col: string, o?: { ascending?: boolean }) {
      const ascending = o?.ascending !== false;
      recorded.orders.push([col, ascending]);
      const prior = [...working];
      working = prior.sort((a, b) => {
        const av = (a as unknown as Record<string, unknown>)[col];
        const bv = (b as unknown as Record<string, unknown>)[col];
        if (av === bv) return prior.indexOf(a) - prior.indexOf(b); // stable
        return (av! > bv! ? 1 : -1) * (ascending ? 1 : -1);
      });
      return builder;
    },
    limit(n: number) {
      recorded.limit = n;
      return Promise.resolve(
        opts.error
          ? { data: null, error: { message: "boom" } }
          : { data: working.slice(0, n), error: null },
      );
    },
  };

  const client = {
    from(table: string) {
      recorded.table = table;
      return builder;
    },
  } as unknown as SupabaseClient;

  return { client, recorded };
}

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";
const HUB_TENANT = "99999999-9999-9999-9999-999999999999";
const TALENT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const rosterOnA: RosterRow[] = [
  {
    tenant_id: TENANT_A,
    is_primary: false,
    added_at: "2026-01-01T00:00:00Z",
    id: "r1",
    status: "active",
  },
];

// ── 1. Hub host and tenant host AGREE ────────────────────────────────────────

test("agency host keys on the surface tenant (unchanged behaviour)", async () => {
  const { client } = stubClient(rosterOnA);
  const resolved = await resolvePublicProfileOverrideTenantId(
    client,
    TENANT_A,
    TALENT,
  );
  assert.equal(resolved, TENANT_A);
});

test("hub host resolves the SAME tenant the agency host uses", async () => {
  // The hub passes null for the surface tenant: `hostCtx.tenantId` on the hub
  // is the hub agency's own tenant, which must never govern a roster talent.
  const hub = await resolvePublicProfileOverrideTenantId(
    stubClient(rosterOnA).client,
    null,
    TALENT,
  );
  const tenantHost = await resolvePublicProfileOverrideTenantId(
    stubClient(rosterOnA).client,
    TENANT_A,
    TALENT,
  );
  assert.equal(hub, tenantHost);
  assert.equal(hub, TENANT_A);
});

test("the hub agency's own tenant is never the answer for a roster talent", async () => {
  const { client } = stubClient(rosterOnA);
  const resolved = await resolvePublicProfileOverrideTenantId(
    client,
    null, // page.tsx passes null for every non-agency host kind
    TALENT,
  );
  assert.notEqual(resolved, HUB_TENANT);
  assert.equal(resolved, TENANT_A);
});

// ── 2. Talent on NO active roster ────────────────────────────────────────────

test("no roster row at all → null (no tenant overrides, canonical defaults)", async () => {
  const { client } = stubClient([]);
  assert.equal(
    await resolvePublicProfileOverrideTenantId(client, null, TALENT),
    null,
  );
});

test("only a status='removed' roster row → null, not the removed tenant", async () => {
  // Known QA-data gotcha: several QA talent carry status='removed' rows. A
  // removed agency must not keep hiding sections on the talent's profile.
  const { client, recorded } = stubClient([
    {
      tenant_id: TENANT_A,
      is_primary: true,
      added_at: "2026-01-01T00:00:00Z",
      id: "r1",
      status: "removed",
    },
  ]);
  const resolved = await resolveGoverningTenantIdForTalent(client, TALENT);
  assert.equal(resolved, null);
  assert.deepEqual(
    recorded.filters.map(([c]) => c),
    ["talent_profile_id", "status"],
  );
  assert.ok(
    recorded.filters.some(([c, v]) => c === "status" && v === "active"),
    "must filter status='active'",
  );
});

test("empty talent id short-circuits to null without a query", async () => {
  const { client, recorded } = stubClient(rosterOnA);
  assert.equal(await resolveGoverningTenantIdForTalent(client, ""), null);
  assert.equal(recorded.table, null);
});

// ── 3. Talent on MULTIPLE tenants — deterministic and stable ────────────────

test("multi-tenant talent: the primary agency wins", async () => {
  const rows: RosterRow[] = [
    // B was added FIRST but A is the primary agency.
    {
      tenant_id: TENANT_B,
      is_primary: false,
      added_at: "2025-01-01T00:00:00Z",
      id: "r-b",
      status: "active",
    },
    {
      tenant_id: TENANT_A,
      is_primary: true,
      added_at: "2026-01-01T00:00:00Z",
      id: "r-a",
      status: "active",
    },
  ];
  const { client, recorded } = stubClient(rows);
  assert.equal(await resolveGoverningTenantIdForTalent(client, TALENT), TENANT_A);
  assert.deepEqual(recorded.orders, [
    ["is_primary", false],
    ["added_at", true],
    ["id", true],
  ]);
  assert.equal(recorded.limit, 1);
});

test("multi-tenant talent with no primary: the oldest roster row wins, stably", async () => {
  const rows: RosterRow[] = [
    {
      tenant_id: TENANT_B,
      is_primary: false,
      added_at: "2026-05-01T00:00:00Z",
      id: "r-b",
      status: "active",
    },
    {
      tenant_id: TENANT_A,
      is_primary: false,
      added_at: "2026-01-01T00:00:00Z",
      id: "r-a",
      status: "active",
    },
  ];
  // Same set, opposite input order → same answer. A later agency joining the
  // roster cannot silently change what the hub renders.
  assert.equal(
    await resolveGoverningTenantIdForTalent(stubClient(rows).client, TALENT),
    TENANT_A,
  );
  assert.equal(
    await resolveGoverningTenantIdForTalent(
      stubClient([...rows].reverse()).client,
      TALENT,
    ),
    TENANT_A,
  );
});

test("multi-tenant tie on added_at falls through to id — total order", async () => {
  const rows: RosterRow[] = [
    {
      tenant_id: TENANT_B,
      is_primary: false,
      added_at: "2026-01-01T00:00:00Z",
      id: "r-b",
      status: "active",
    },
    {
      tenant_id: TENANT_A,
      is_primary: false,
      added_at: "2026-01-01T00:00:00Z",
      id: "r-a",
      status: "active",
    },
  ];
  assert.equal(
    await resolveGoverningTenantIdForTalent(stubClient(rows).client, TALENT),
    TENANT_A, // "r-a" < "r-b"
  );
});

// ── 4. Fail direction on a read error ────────────────────────────────────────

test("a roster read error resolves to null, not to a wrong tenant", async () => {
  const { client } = stubClient(rosterOnA, { error: true });
  assert.equal(
    await resolvePublicProfileOverrideTenantId(client, null, TALENT),
    null,
  );
});

// ── 5. Static pin: the public profile must not re-introduce hostCtx keying ───

test("INVARIANT /t/[profileCode]: override-keyed reads use the resolved tenant, not hostCtx.tenantId", () => {
  const src = readFileSync("src/app/t/[profileCode]/page.tsx", "utf8");

  // The sidebar SECTION gate is the surface this test exists for.
  assert.match(
    src,
    /readPublicSidebarVisibility\(\s*pub,\s*overrideTenantId,?\s*\)/,
    "sidebar section visibility must be keyed on the resolved override tenant",
  );
  assert.doesNotMatch(
    src,
    /readPublicSidebarVisibility\([^)]*hostCtx\.tenantId/,
    "hostCtx.tenantId is the HUB agency's own tenant on the hub host — never the section key",
  );

  // Category overrides go through the same resolved tenant, so the section
  // gates and the category labels inside them cannot disagree either.
  assert.doesNotMatch(
    src,
    /loadProfileTaxonomyVisibility\(\s*hostCtx/,
    "category overrides must take the resolved tenant, not the host context",
  );

  // Exactly one place may turn the host context into an override tenant, and it
  // must drop the non-agency host kinds (hub carries the hub agency's tenant).
  // Both call sites (generateMetadata + the page body) go through it.
  assert.equal(
    (src.match(/resolveProfileOverrideTenantId\(hostCtx/g) ?? []).length,
    2,
    "resolveProfileOverrideTenantId must stay the single host→tenant seam",
  );
  assert.match(
    src,
    /hostCtx\.kind === "agency" \? hostCtx\.tenantId : null/,
    "the hub/talent-site/unknown host kinds must fall through to the roster tenant",
  );
});

test("a read error on an AGENCY host still keys on the surface tenant", async () => {
  // The agency host never touches the roster — its tenant is authoritative and
  // a Supabase blip cannot drop that tenant's deliberate hides.
  const { client, recorded } = stubClient(rosterOnA, { error: true });
  assert.equal(
    await resolvePublicProfileOverrideTenantId(client, TENANT_A, TALENT),
    TENANT_A,
  );
  assert.equal(recorded.table, null, "no roster query on an agency host");
});
