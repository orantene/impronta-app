import assert from "node:assert/strict";
import test from "node:test";
import {
  decideTalentLifecycle,
  runTalentLifecycle,
  type TalentLifecycleDeps,
  type TalentSubscriptionRow,
} from "./talent-subscription-lifecycle";

const OWNER = "user-owner";

function row(over: Partial<TalentSubscriptionRow> = {}): TalentSubscriptionRow {
  return {
    user_id: OWNER,
    stripe_subscription_id: "sub_test_1",
    status: "active",
    current_period_end: "2026-11-01T00:00:00.000Z",
    cancel_at_period_end: false,
    ...over,
  };
}

type Calls = { stripe: Array<[string, boolean]>; mirror: Array<[string, boolean]> };

function fakeDeps(r: TalentSubscriptionRow | null, opts: { stripeThrows?: boolean } = {}) {
  const calls: Calls = { stripe: [], mirror: [] };
  const deps: TalentLifecycleDeps = {
    loadRow: async () => r,
    setStripeCancelFlag: async (id, flag) => {
      calls.stripe.push([id, flag]);
      if (opts.stripeThrows) throw new Error("stripe down");
      return "2026-11-02T00:00:00.000Z";
    },
    mirror: async (id, flag) => {
      calls.mirror.push([id, flag]);
    },
  };
  return { deps, calls };
}

test("another user's subscription is reported as not found and never touched", async () => {
  const { deps, calls } = fakeDeps(row({ user_id: "someone-else" }));
  const res = await runTalentLifecycle(deps, { talentProfileId: "tp1", callerUserId: OWNER, action: "cancel" });
  assert.deepEqual(res, { ok: false, code: "not_found" });
  assert.equal(calls.stripe.length, 0);
  assert.equal(calls.mirror.length, 0);
});

test("missing row and empty caller id are not found", () => {
  assert.deepEqual(decideTalentLifecycle(null, OWNER, "cancel"), { kind: "error", code: "not_found" });
  assert.deepEqual(decideTalentLifecycle(row(), "", "cancel"), { kind: "error", code: "not_found" });
});

test("no Stripe subscription id: nothing to cancel", () => {
  assert.deepEqual(
    decideTalentLifecycle(row({ stripe_subscription_id: null }), OWNER, "cancel"),
    { kind: "error", code: "no_subscription" },
  );
});

test("cancel reaches Stripe first, then mirrors", async () => {
  const { deps, calls } = fakeDeps(row());
  const res = await runTalentLifecycle(deps, { talentProfileId: "tp1", callerUserId: OWNER, action: "cancel" });
  assert.deepEqual(res, { ok: true, cancelAtPeriodEnd: true, periodEnd: "2026-11-02T00:00:00.000Z" });
  assert.deepEqual(calls.stripe, [["sub_test_1", true]]);
  assert.deepEqual(calls.mirror, [["tp1", true]]);
});

test("cancel twice is a harmless no-op", async () => {
  const { deps, calls } = fakeDeps(row({ cancel_at_period_end: true }));
  const res = await runTalentLifecycle(deps, { talentProfileId: "tp1", callerUserId: OWNER, action: "cancel" });
  assert.equal(res.ok, true);
  assert.equal(calls.stripe.length, 0);
});

test("resume undoes a scheduled cancel", async () => {
  const { deps, calls } = fakeDeps(row({ cancel_at_period_end: true }));
  const res = await runTalentLifecycle(deps, { talentProfileId: "tp1", callerUserId: OWNER, action: "resume" });
  assert.deepEqual(res, { ok: true, cancelAtPeriodEnd: false, periodEnd: "2026-11-02T00:00:00.000Z" });
  assert.deepEqual(calls.stripe, [["sub_test_1", false]]);
});

test("resume after the plan ended is refused", () => {
  for (const status of ["canceled", "cancelled", "incomplete_expired"]) {
    assert.deepEqual(
      decideTalentLifecycle(row({ status, cancel_at_period_end: true }), OWNER, "resume"),
      { kind: "error", code: "already_ended" },
    );
  }
});

test("resume on a plan that is not cancelling is a no-op", () => {
  assert.equal(decideTalentLifecycle(row(), OWNER, "resume").kind, "noop");
});

test("a Stripe failure is not mirrored locally", async () => {
  const { deps, calls } = fakeDeps(row(), { stripeThrows: true });
  const res = await runTalentLifecycle(deps, { talentProfileId: "tp1", callerUserId: OWNER, action: "cancel" });
  assert.deepEqual(res, { ok: false, code: "stripe_failed" });
  assert.equal(calls.mirror.length, 0);
});
