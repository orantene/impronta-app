/**
 * CHARACTERIZATION TEST — owning-party-resolver.ts (deep / uncovered branches)
 *
 * Phase 0 safety-net (remediation-plan-2026-05-19 §3 line 51 + §5). Per-row
 * owning-party resolution is the spine of cross-tenant fan-out + per-row
 * commission; freezing it correctly at submit time is load-bearing.
 *
 * COMPLEMENT, NOT A DUPLICATE: owning-party-resolver.test.ts covers the
 * BATCH fn `resolveOwningPartiesForTalents` on the happy decision tree
 * (studio/agency/free/none + one batch + empty input). It does NOT cover:
 *
 *   • resolveOwningPartyForTalent — the SINGLE-talent fn — at all (0 tests)
 *   • the DB-error → null / → all-independent fallback on EITHER fn
 *   • the "network" / "hub-network" exclusive tiers (only studio/agency tested)
 *   • plan_tier === null (non-exclusive fall-through)
 *   • the Supabase array-shaped FK embed (`agencies: [{...}]`) — only the
 *     single-object shape is exercised elsewhere
 *   • pending-only rosters (no active row) → `?? rows[0]` status fallback
 *
 * This file pins exactly those. Decision tree (source §14):
 *   1. is_primary row whose agency plan_tier ∈ {studio,agency,network,
 *      hub-network} → ('agency', tenant_id)
 *   2. otherwise, first active (else first) row              → ('workspace', tenant_id)
 *   3. no rows at all                                        → ('talent', talent_id)
 *   error → single: null ; batch: every input → ('talent', id)
 *
 * Snapshots CURRENT behavior incl. quirks. Nothing is fixed here.
 * Run: npx tsx --test src/lib/inquiry/owning-party-resolver-single.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveOwningPartyForTalent,
  resolveOwningPartiesForTalents,
} from "./owning-party-resolver";

type AgencyEmbed =
  | { id: string; plan_tier: string | null }
  | { id: string; plan_tier: string | null }[]
  | null;
type RosterRow = {
  tenant_id: string;
  talent_profile_id: string;
  is_primary: boolean;
  status: string;
  agencies: AgencyEmbed;
};

type QueryResult = { data: RosterRow[] | null; error: { message: string } | null };

/**
 * Chainable supabase mock covering BOTH fns' chains:
 *   single: from→select→eq→in        (awaited)
 *   batch:  from→select→in→in        (awaited)
 * The builder is thenable and resolves to the supplied {data,error}.
 */
function makeMockSupabase(result: QueryResult) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    then: (resolve: (v: QueryResult) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  return { from: () => builder } as unknown as Parameters<
    typeof resolveOwningPartyForTalent
  >[0];
}

const ok = (rows: RosterRow[]): QueryResult => ({ data: rows, error: null });

// ─────────────────────────────────────────────────────────────────────────────
// resolveOwningPartyForTalent — the single-talent fn (was 0% covered).
// ─────────────────────────────────────────────────────────────────────────────

test("single: primary on studio → ('agency', tenant_id)", async () => {
  const sb = makeMockSupabase(
    ok([
      {
        tenant_id: "ag-studio",
        talent_profile_id: "t1",
        is_primary: true,
        status: "active",
        agencies: { id: "ag-studio", plan_tier: "studio" },
      },
    ]),
  );
  assert.deepEqual(await resolveOwningPartyForTalent(sb, "t1"), {
    type: "agency",
    id: "ag-studio",
  });
});

test("single: primary on 'network' tier → ('agency', tenant_id) [tier untested elsewhere]", async () => {
  const sb = makeMockSupabase(
    ok([
      {
        tenant_id: "ag-net",
        talent_profile_id: "t1",
        is_primary: true,
        status: "active",
        agencies: { id: "ag-net", plan_tier: "network" },
      },
    ]),
  );
  assert.deepEqual(await resolveOwningPartyForTalent(sb, "t1"), {
    type: "agency",
    id: "ag-net",
  });
});

test("single: primary on 'hub-network' tier → ('agency', tenant_id) [tier untested elsewhere]", async () => {
  const sb = makeMockSupabase(
    ok([
      {
        tenant_id: "ag-hub",
        talent_profile_id: "t1",
        is_primary: true,
        status: "active",
        agencies: { id: "ag-hub", plan_tier: "hub-network" },
      },
    ]),
  );
  assert.deepEqual(await resolveOwningPartyForTalent(sb, "t1"), {
    type: "agency",
    id: "ag-hub",
  });
});

test("single: primary on free → ('workspace', tenant_id) — Free has no exclusivity", async () => {
  const sb = makeMockSupabase(
    ok([
      {
        tenant_id: "ws-free",
        talent_profile_id: "t1",
        is_primary: true,
        status: "active",
        agencies: { id: "ws-free", plan_tier: "free" },
      },
    ]),
  );
  assert.deepEqual(await resolveOwningPartyForTalent(sb, "t1"), {
    type: "workspace",
    id: "ws-free",
  });
});

test("single: primary with plan_tier === null → not exclusive → ('workspace', tenant_id)", async () => {
  const sb = makeMockSupabase(
    ok([
      {
        tenant_id: "ws-x",
        talent_profile_id: "t1",
        is_primary: true,
        status: "active",
        agencies: { id: "ws-x", plan_tier: null },
      },
    ]),
  );
  assert.deepEqual(await resolveOwningPartyForTalent(sb, "t1"), {
    type: "workspace",
    id: "ws-x",
  });
});

test("single: primary but `agencies` embed is null → treated as non-exclusive → ('workspace', tenant_id)", async () => {
  const sb = makeMockSupabase(
    ok([
      {
        tenant_id: "ws-y",
        talent_profile_id: "t1",
        is_primary: true,
        status: "active",
        agencies: null,
      },
    ]),
  );
  assert.deepEqual(await resolveOwningPartyForTalent(sb, "t1"), {
    type: "workspace",
    id: "ws-y",
  });
});

test("single: Supabase array-shaped FK embed `agencies:[{studio}]` → still resolves ('agency', tenant_id)", async () => {
  const sb = makeMockSupabase(
    ok([
      {
        tenant_id: "ag-arr",
        talent_profile_id: "t1",
        is_primary: true,
        status: "active",
        agencies: [{ id: "ag-arr", plan_tier: "studio" }],
      },
    ]),
  );
  assert.deepEqual(await resolveOwningPartyForTalent(sb, "t1"), {
    type: "agency",
    id: "ag-arr",
  });
});

test("single: no roster rows → ('talent', talent_profile_id) — independent", async () => {
  const sb = makeMockSupabase(ok([]));
  assert.deepEqual(await resolveOwningPartyForTalent(sb, "indie-1"), {
    type: "talent",
    id: "indie-1",
  });
});

test("single: DB error → null (caller is contracted to fall back to workspace+tenant)", async () => {
  const sb = makeMockSupabase({ data: null, error: { message: "boom" } });
  assert.equal(await resolveOwningPartyForTalent(sb, "t1"), null);
});

test("single: non-primary studio + primary free → ('workspace', free) — Studio doesn't auto-promote off a non-primary row", async () => {
  const sb = makeMockSupabase(
    ok([
      {
        tenant_id: "ag-studio",
        talent_profile_id: "t1",
        is_primary: false,
        status: "active",
        agencies: { id: "ag-studio", plan_tier: "studio" },
      },
      {
        tenant_id: "ws-free",
        talent_profile_id: "t1",
        is_primary: true,
        status: "active",
        agencies: { id: "ws-free", plan_tier: "free" },
      },
    ]),
  );
  // No primary on an exclusive tier → first ACTIVE row wins.
  const got = await resolveOwningPartyForTalent(sb, "t1");
  assert.equal(got?.type, "workspace");
  assert.equal(got?.id, "ag-studio"); // first active row in fixture order
});

test("single: primary-exclusive scan is order-independent — a later primary-on-studio still wins over an earlier non-exclusive primary", async () => {
  const sb = makeMockSupabase(
    ok([
      {
        tenant_id: "ws-free",
        talent_profile_id: "t1",
        is_primary: true,
        status: "active",
        agencies: { id: "ws-free", plan_tier: "free" },
      },
      {
        tenant_id: "ag-studio",
        talent_profile_id: "t1",
        is_primary: true,
        status: "active",
        agencies: { id: "ag-studio", plan_tier: "studio" },
      },
    ]),
  );
  assert.deepEqual(await resolveOwningPartyForTalent(sb, "t1"), {
    type: "agency",
    id: "ag-studio",
  });
});

test("single QUIRK: pending-only roster (no active row) → status fallback `?? rows[0]` makes the PENDING workspace the owning party", async () => {
  // `.in("status",["active","pending"])` lets pending rows through; with no
  // active row, `rows.find(active) ?? rows[0]` picks the pending row. A
  // not-yet-active roster relationship therefore becomes the frozen owner.
  const sb = makeMockSupabase(
    ok([
      {
        tenant_id: "ws-pending",
        talent_profile_id: "t1",
        is_primary: false,
        status: "pending",
        agencies: { id: "ws-pending", plan_tier: "free" },
      },
    ]),
  );
  assert.deepEqual(await resolveOwningPartyForTalent(sb, "t1"), {
    type: "workspace",
    id: "ws-pending",
  });
});

test("single QUIRK: a PENDING primary on an exclusive tier still resolves to ('agency', …) — the primary-exclusive scan never checks status", async () => {
  const sb = makeMockSupabase(
    ok([
      {
        tenant_id: "ag-studio",
        talent_profile_id: "t1",
        is_primary: true,
        status: "pending",
        agencies: { id: "ag-studio", plan_tier: "studio" },
      },
    ]),
  );
  assert.deepEqual(await resolveOwningPartyForTalent(sb, "t1"), {
    type: "agency",
    id: "ag-studio",
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveOwningPartiesForTalents — batch branches the existing suite skips.
// ─────────────────────────────────────────────────────────────────────────────

test("batch: DB error → EVERY input id maps to ('talent', id) independent fallback", async () => {
  const sb = makeMockSupabase({ data: null, error: { message: "boom" } });
  const res = await resolveOwningPartiesForTalents(sb, ["a", "b", "c"]);
  assert.equal(res.size, 3);
  assert.deepEqual(res.get("a"), { type: "talent", id: "a" });
  assert.deepEqual(res.get("b"), { type: "talent", id: "b" });
  assert.deepEqual(res.get("c"), { type: "talent", id: "c" });
});

test("batch: 'network' + 'hub-network' tiers + array-shaped embed all resolve to ('agency', …)", async () => {
  const sb = makeMockSupabase(
    ok([
      {
        tenant_id: "ag-net",
        talent_profile_id: "t-net",
        is_primary: true,
        status: "active",
        agencies: { id: "ag-net", plan_tier: "network" },
      },
      {
        tenant_id: "ag-hub",
        talent_profile_id: "t-hub",
        is_primary: true,
        status: "active",
        agencies: [{ id: "ag-hub", plan_tier: "hub-network" }],
      },
    ]),
  );
  const res = await resolveOwningPartiesForTalents(sb, ["t-net", "t-hub"]);
  assert.deepEqual(res.get("t-net"), { type: "agency", id: "ag-net" });
  assert.deepEqual(res.get("t-hub"), { type: "agency", id: "ag-hub" });
});

test("batch QUIRK: pending-only row → ('workspace', pending_tenant) via the `?? myRows[0]` fallback", async () => {
  const sb = makeMockSupabase(
    ok([
      {
        tenant_id: "ws-pending",
        talent_profile_id: "t1",
        is_primary: false,
        status: "pending",
        agencies: { id: "ws-pending", plan_tier: "free" },
      },
    ]),
  );
  const res = await resolveOwningPartiesForTalents(sb, ["t1"]);
  assert.deepEqual(res.get("t1"), { type: "workspace", id: "ws-pending" });
});
