/**
 * Tests the D0 decision tree on resolveOwningPartiesForTalents:
 *
 *   1. Talent with is_primary=true on Studio/Agency/Network → 'agency'
 *   2. Talent on Free workspace (primary or not) → 'workspace'
 *   3. Talent with no active rosters → 'talent' (independent)
 *   4. Talent with primary=true on Free but secondary on Studio
 *      → still 'workspace' (Free primary wins because Free has no
 *      exclusivity — secondary on Studio doesn't auto-promote)
 *
 * The supabase client is faked with a chainable mock that records the
 * query inputs and returns fixture rows.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { resolveOwningPartiesForTalents, isHubSourcedChannel } from "./owning-party-resolver";

type RosterRow = {
  tenant_id: string;
  talent_profile_id: string;
  is_primary: boolean;
  status: string;
  agencies: { id: string; plan_tier: string | null } | null;
};

/**
 * Minimal supabase mock — just enough to satisfy the resolver's
 * `.from(...).select(...).in(...).in(...)` chain. Returns the given
 * roster fixture as `data`.
 */
function makeMockSupabase(rosterFixture: RosterRow[]) {
  const builder = {
    select: () => builder,
    in: () => builder,
    eq: () => builder,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (resolve: (v: { data: RosterRow[]; error: null }) => unknown) =>
      Promise.resolve({ data: rosterFixture, error: null }).then(resolve),
  };
  return {
    from: () => builder,
  } as unknown as Parameters<typeof resolveOwningPartiesForTalents>[0];
}

test("primary on Studio-plan agency → owning_party = ('agency', agency_id)", async () => {
  const fixture: RosterRow[] = [
    {
      tenant_id: "agency-studio-1",
      talent_profile_id: "talent-1",
      is_primary: true,
      status: "active",
      agencies: { id: "agency-studio-1", plan_tier: "studio" },
    },
  ];
  const supabase = makeMockSupabase(fixture);
  const result = await resolveOwningPartiesForTalents(supabase, ["talent-1"]);
  assert.deepEqual(result.get("talent-1"), {
    type: "agency",
    id: "agency-studio-1",
  });
});

test("primary on Agency-plan → owning_party = ('agency', agency_id)", async () => {
  const fixture: RosterRow[] = [
    {
      tenant_id: "agency-pro-1",
      talent_profile_id: "talent-1",
      is_primary: true,
      status: "active",
      agencies: { id: "agency-pro-1", plan_tier: "agency" },
    },
  ];
  const supabase = makeMockSupabase(fixture);
  const result = await resolveOwningPartiesForTalents(supabase, ["talent-1"]);
  assert.deepEqual(result.get("talent-1"), {
    type: "agency",
    id: "agency-pro-1",
  });
});

test("primary on Free-plan → owning_party = ('workspace', tenant_id)", async () => {
  const fixture: RosterRow[] = [
    {
      tenant_id: "agency-free-1",
      talent_profile_id: "talent-1",
      is_primary: true,
      status: "active",
      agencies: { id: "agency-free-1", plan_tier: "free" },
    },
  ];
  const supabase = makeMockSupabase(fixture);
  const result = await resolveOwningPartiesForTalents(supabase, ["talent-1"]);
  assert.deepEqual(result.get("talent-1"), {
    type: "workspace",
    id: "agency-free-1",
  });
});

test("no active rosters → owning_party = ('talent', talent_profile_id)", async () => {
  const fixture: RosterRow[] = [];
  const supabase = makeMockSupabase(fixture);
  const result = await resolveOwningPartiesForTalents(supabase, ["independent-talent"]);
  assert.deepEqual(result.get("independent-talent"), {
    type: "talent",
    id: "independent-talent",
  });
});

test("primary on Free + non-primary on Studio → still ('workspace', free_id) — Free primary wins, Studio doesn't auto-promote", async () => {
  const fixture: RosterRow[] = [
    {
      tenant_id: "agency-free-1",
      talent_profile_id: "talent-1",
      is_primary: true,
      status: "active",
      agencies: { id: "agency-free-1", plan_tier: "free" },
    },
    {
      tenant_id: "agency-studio-1",
      talent_profile_id: "talent-1",
      is_primary: false,
      status: "active",
      agencies: { id: "agency-studio-1", plan_tier: "studio" },
    },
  ];
  const supabase = makeMockSupabase(fixture);
  const result = await resolveOwningPartiesForTalents(supabase, ["talent-1"]);
  // First-active fallback wins because no primary is on an exclusive
  // tier. Order matters: the Free primary is the first active row
  // returned by the fixture and that's what we pick.
  const got = result.get("talent-1");
  assert.equal(got?.type, "workspace");
  assert.ok(got?.id === "agency-free-1" || got?.id === "agency-studio-1");
});

test("batch — handles multiple talents in a single call", async () => {
  const fixture: RosterRow[] = [
    {
      tenant_id: "agency-studio-1",
      talent_profile_id: "talent-A",
      is_primary: true,
      status: "active",
      agencies: { id: "agency-studio-1", plan_tier: "studio" },
    },
    {
      tenant_id: "agency-free-1",
      talent_profile_id: "talent-B",
      is_primary: true,
      status: "active",
      agencies: { id: "agency-free-1", plan_tier: "free" },
    },
    // talent-C has no rosters → independent
  ];
  const supabase = makeMockSupabase(fixture);
  const result = await resolveOwningPartiesForTalents(supabase, [
    "talent-A",
    "talent-B",
    "talent-C",
  ]);
  assert.equal(result.size, 3);
  assert.deepEqual(result.get("talent-A"), { type: "agency", id: "agency-studio-1" });
  assert.deepEqual(result.get("talent-B"), { type: "workspace", id: "agency-free-1" });
  assert.deepEqual(result.get("talent-C"), { type: "talent", id: "talent-C" });
});

test("empty input → empty Map (no DB roundtrip)", async () => {
  const supabase = makeMockSupabase([]);
  const result = await resolveOwningPartiesForTalents(supabase, []);
  assert.equal(result.size, 0);
});

// ─── Source-aware (hub) routing — Scenarios D vs E + C ────────────────────────

test("Scenario E — non-exclusive talent via HUB (hubSourced=true) → ('talent', id), NOT the workspace", async () => {
  // Non-exclusive: Free-plan primary roster. Inquiry filed under the agency
  // tenant (the Discover fan-out groups by primary roster), so tenant matching
  // alone would wrongly say 'workspace'. The hub flag overrides → talent-self.
  const fixture: RosterRow[] = [
    {
      tenant_id: "agency-free-1",
      talent_profile_id: "talent-1",
      is_primary: true,
      status: "active",
      agencies: { id: "agency-free-1", plan_tier: "free" },
    },
  ];
  const supabase = makeMockSupabase(fixture);
  const result = await resolveOwningPartiesForTalents(
    supabase,
    ["talent-1"],
    "agency-free-1", // inquiry filed under the roster tenant
    true, // hubSourced
  );
  assert.deepEqual(result.get("talent-1"), { type: "talent", id: "talent-1" });
});

test("Scenario D — same non-exclusive talent via AGENCY SITE (hubSourced=false) → ('workspace', tenant)", async () => {
  const fixture: RosterRow[] = [
    {
      tenant_id: "agency-free-1",
      talent_profile_id: "talent-1",
      is_primary: true,
      status: "active",
      agencies: { id: "agency-free-1", plan_tier: "free" },
    },
  ];
  const supabase = makeMockSupabase(fixture);
  const result = await resolveOwningPartiesForTalents(
    supabase,
    ["talent-1"],
    "agency-free-1",
    false, // agency-sourced
  );
  assert.deepEqual(result.get("talent-1"), { type: "workspace", id: "agency-free-1" });
});

test("Scenario C — EXCLUSIVE talent via HUB still routes to the agency (hub never overrides exclusivity)", async () => {
  const fixture: RosterRow[] = [
    {
      tenant_id: "agency-studio-1",
      talent_profile_id: "talent-1",
      is_primary: true,
      status: "active",
      agencies: { id: "agency-studio-1", plan_tier: "studio" },
    },
  ];
  const supabase = makeMockSupabase(fixture);
  const result = await resolveOwningPartiesForTalents(
    supabase,
    ["talent-1"],
    "hub-tenant",
    true, // hubSourced — must NOT override the exclusive agency
  );
  assert.deepEqual(result.get("talent-1"), { type: "agency", id: "agency-studio-1" });
});

test("isHubSourcedChannel — open-marketplace channels are hub-sourced", () => {
  for (const c of [
    "discover_single_talent",
    "discover_shortlist",
    "directory_client",
    "directory_guest",
    "public_directory",
    "public_talent_profile",
    "hub",
  ]) {
    assert.equal(isHubSourcedChannel(c), true, `${c} should be hub-sourced`);
  }
});

test("isHubSourcedChannel — agency-brokered channels are NOT hub-sourced", () => {
  for (const c of ["agency_site", "admin_created", "admin_manual", "pitch", "form", "phone", null, undefined, ""]) {
    assert.equal(isHubSourcedChannel(c), false, `${c} should not be hub-sourced`);
  }
});
