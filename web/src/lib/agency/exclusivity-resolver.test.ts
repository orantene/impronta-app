/**
 * Tests the auto-exclusivity decision tree:
 *
 *   1. Studio/Agency/Network plan + no existing exclusive   → set exclusive
 *   2. Studio plan + existing exclusive elsewhere           → don't set
 *   3. Free plan (any state)                                → don't set
 *   4. Unknown / missing plan tier                          → don't set
 *
 * The supabase client is faked with a chainable mock that records the
 * query inputs and returns fixture rows.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { resolveExclusivityForRosterAdd } from "./exclusivity-resolver";

type Fixture = {
  /** agencies.plan_tier lookup result. */
  planTier: string | null;
  /** Existing exclusive rosters on OTHER tenants. */
  existingExclusives: Array<{ tenant_id: string }>;
};

function makeMockSupabase(fix: Fixture) {
  const builder: Record<string, unknown> = {};
  let currentTable = "";

  builder.from = (t: string) => {
    currentTable = t;
    return builder;
  };
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.in = () => builder;
  builder.neq = () => builder;
  builder.limit = () => builder;
  builder.maybeSingle = () =>
    currentTable === "agencies"
      ? Promise.resolve({
          data: fix.planTier === null ? null : { plan_tier: fix.planTier },
          error: null,
        })
      : Promise.resolve({ data: null, error: null });
  builder.then = (
    resolve: (v: { data: Array<{ tenant_id: string }>; error: null }) => unknown,
  ) =>
    Promise.resolve({ data: fix.existingExclusives, error: null }).then(resolve);

  return { from: builder.from } as unknown as Parameters<
    typeof resolveExclusivityForRosterAdd
  >[0];
}

test("Studio plan + no existing exclusive → set_exclusive + auto_assigned", async () => {
  const sb = makeMockSupabase({ planTier: "studio", existingExclusives: [] });
  const result = await resolveExclusivityForRosterAdd(sb, "t1", "tal1");
  assert.equal(result.shouldBeExclusive, true);
  assert.equal(result.planTier, "studio");
  assert.equal(result.reason, "set_exclusive");
  // Exclusivity-confirmation flow: status='auto_assigned' so the talent
  // sees a prompt; autoAssignedAt is set so the UI can compute the
  // countdown.
  assert.equal(result.exclusivityStatus, "auto_assigned");
  assert.ok(result.autoAssignedAt !== null, "autoAssignedAt should be set");
});

test("Agency plan + no existing exclusive → set_exclusive", async () => {
  const sb = makeMockSupabase({ planTier: "agency", existingExclusives: [] });
  const result = await resolveExclusivityForRosterAdd(sb, "t1", "tal1");
  assert.equal(result.shouldBeExclusive, true);
  assert.equal(result.reason, "set_exclusive");
});

test("Network plan + no existing exclusive → set_exclusive", async () => {
  const sb = makeMockSupabase({ planTier: "network", existingExclusives: [] });
  const result = await resolveExclusivityForRosterAdd(sb, "t1", "tal1");
  assert.equal(result.shouldBeExclusive, true);
});

test("Hub-Network plan + no existing exclusive → set_exclusive", async () => {
  const sb = makeMockSupabase({ planTier: "hub-network", existingExclusives: [] });
  const result = await resolveExclusivityForRosterAdd(sb, "t1", "tal1");
  assert.equal(result.shouldBeExclusive, true);
});

test("Free plan → never exclusive (friend-link case)", async () => {
  const sb = makeMockSupabase({ planTier: "free", existingExclusives: [] });
  const result = await resolveExclusivityForRosterAdd(sb, "t1", "tal1");
  assert.equal(result.shouldBeExclusive, false);
  assert.equal(result.planTier, "free");
  assert.equal(result.reason, "free_plan");
  // Non-exclusive insert: status='confirmed', no auto-assignment timestamp.
  assert.equal(result.exclusivityStatus, "confirmed");
  assert.equal(result.autoAssignedAt, null);
});

test("Studio plan + existing exclusive on different agency → no auto-flip", async () => {
  const sb = makeMockSupabase({
    planTier: "studio",
    existingExclusives: [{ tenant_id: "other-agency" }],
  });
  const result = await resolveExclusivityForRosterAdd(sb, "t1", "tal1");
  assert.equal(result.shouldBeExclusive, false);
  assert.equal(result.planTier, "studio");
  assert.equal(result.reason, "already_exclusive_elsewhere");
  assert.equal(result.exclusivityStatus, "confirmed");
  assert.equal(result.autoAssignedAt, null);
});

test("Unknown / null plan tier → no exclusive", async () => {
  const sb = makeMockSupabase({ planTier: null, existingExclusives: [] });
  const result = await resolveExclusivityForRosterAdd(sb, "t1", "tal1");
  assert.equal(result.shouldBeExclusive, false);
  assert.equal(result.reason, "unknown_plan");
});
