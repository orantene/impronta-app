import assert from "node:assert/strict";
import test from "node:test";
import { decideTalentPlanState, type TalentPlanDecisionInput } from "./talent-plan-state";

function input(over: Partial<TalentPlanDecisionInput> = {}): TalentPlanDecisionInput {
  return {
    eventType: "customer.subscription.updated",
    subscriptionId: "sub_test_1",
    status: "active",
    planKey: "talent_pro",
    existing: { status: "active", plan_key: "talent_pro", stripe_subscription_id: "sub_test_1" },
    previousProfilePlan: "talent_pro",
    ...over,
  };
}

test("created on a fresh profile grants the plan and flags a plan change", () => {
  const d = decideTalentPlanState(
    input({ eventType: "customer.subscription.created", existing: null, previousProfilePlan: "talent_basic" }),
  );
  assert.deepEqual(d, { kind: "write", rowPlan: "talent_pro", profilePlan: "talent_pro", status: "active", planChanged: true });
});

test("replaying the same updated event is a no-change write (idempotent)", () => {
  const d = decideTalentPlanState(input());
  assert.equal(d.kind, "write");
  if (d.kind === "write") assert.equal(d.planChanged, false);
});

test("deleted downgrades to basic and keeps the last paid tier on the row", () => {
  const d = decideTalentPlanState(
    input({ eventType: "customer.subscription.deleted", planKey: "talent_portfolio", existing: { status: "active", plan_key: "talent_portfolio", stripe_subscription_id: "sub_test_1" }, previousProfilePlan: "talent_portfolio" }),
  );
  assert.deepEqual(d, { kind: "write", rowPlan: "talent_portfolio", profilePlan: "talent_basic", status: "cancelled", planChanged: true });
});

test("a stale updated after cancel is skipped", () => {
  const d = decideTalentPlanState(
    input({ existing: { status: "cancelled", plan_key: "talent_pro", stripe_subscription_id: "sub_test_1" }, previousProfilePlan: "talent_basic" }),
  );
  assert.equal(d.kind, "skip_stale");
});

test("a new subscription after cancel (resubscribe) is allowed", () => {
  const d = decideTalentPlanState(
    input({ subscriptionId: "sub_test_2", eventType: "customer.subscription.created", existing: { status: "cancelled", plan_key: "talent_pro", stripe_subscription_id: "sub_test_1" }, previousProfilePlan: "talent_basic" }),
  );
  assert.equal(d.kind, "write");
  if (d.kind === "write") assert.equal(d.profilePlan, "talent_pro");
});

test("a late deleted for a replaced subscription does not downgrade the new one", () => {
  const d = decideTalentPlanState(
    input({ subscriptionId: "sub_old", eventType: "customer.subscription.deleted", existing: { status: "active", plan_key: "talent_pro", stripe_subscription_id: "sub_new" } }),
  );
  assert.equal(d.kind, "skip_stale");
});

test("past_due keeps access during the grace window", () => {
  const d = decideTalentPlanState(input({ eventType: "sync", status: "past_due" }));
  assert.equal(d.kind, "write");
  if (d.kind === "write") {
    assert.equal(d.profilePlan, "talent_pro");
    assert.equal(d.status, "past_due");
  }
});

test("incomplete does not grant a paid plan", () => {
  const d = decideTalentPlanState(input({ status: "incomplete", existing: null, previousProfilePlan: "talent_basic" }));
  assert.equal(d.kind, "write");
  if (d.kind === "write") {
    assert.equal(d.profilePlan, "talent_basic");
    assert.equal(d.planChanged, false);
  }
});

test("upgrade pro to portfolio flags a plan change", () => {
  const d = decideTalentPlanState(input({ planKey: "talent_portfolio" }));
  assert.equal(d.kind, "write");
  if (d.kind === "write") {
    assert.equal(d.profilePlan, "talent_portfolio");
    assert.equal(d.planChanged, true);
  }
});

// TUL-1835: a second subscription must never overwrite a live row.
for (const live of ["active", "trialing", "past_due"]) {
  test(`a different subscription while the row is ${live} is a duplicate, not a write`, () => {
    const d = decideTalentPlanState(
      input({
        subscriptionId: "sub_test_2",
        eventType: "customer.subscription.created",
        status: "trialing",
        existing: { status: live, plan_key: "talent_portfolio", stripe_subscription_id: "sub_test_1" },
      }),
    );
    assert.equal(d.kind, "duplicate_live");
    if (d.kind === "duplicate_live") assert.equal(d.existingSubscriptionId, "sub_test_1");
  });
}

test("a trialing second subscription over a live yearly one is a duplicate (QA case)", () => {
  const d = decideTalentPlanState(
    input({
      subscriptionId: "sub_monthly",
      status: "trialing",
      planKey: "talent_portfolio",
      existing: { status: "active", plan_key: "talent_portfolio", stripe_subscription_id: "sub_yearly" },
    }),
  );
  assert.equal(d.kind, "duplicate_live");
});

test("the duplicate being cancelled later is skipped, the live row stays", () => {
  const d = decideTalentPlanState(
    input({
      subscriptionId: "sub_test_2",
      eventType: "customer.subscription.deleted",
      existing: { status: "active", plan_key: "talent_pro", stripe_subscription_id: "sub_test_1" },
    }),
  );
  assert.equal(d.kind, "skip_stale");
});

test("the same subscription updating while live is still a normal write", () => {
  assert.equal(decideTalentPlanState(input({ status: "trialing" })).kind, "write");
});
