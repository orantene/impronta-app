import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";

import { classifyStripeEvent, isPlanChangeUpdate } from "./webhook-routing";
import { decideTalentPlanState } from "@/lib/billing/talent-plan-state";

/** TUL-831: plan changes (price swap, schedule phase) re-fetch and resync. */

function evt(type: string, object: Record<string, unknown>, previous?: Record<string, unknown>): Stripe.Event {
  return {
    id: "evt_pc_1",
    type,
    api_version: "2026-04-22.dahlia",
    livemode: false,
    data: { object, ...(previous ? { previous_attributes: previous } : {}) },
  } as unknown as Stripe.Event;
}

const talentSub = { id: "sub_1", metadata: { checkout_type: "talent_subscription", plan_key: "talent_portfolio" } };

test("subscription.updated with an items change routes to a re-fetching resync", () => {
  const a = classifyStripeEvent(evt("customer.subscription.updated", talentSub, { items: { data: [] } }));
  assert.deepEqual(a, { kind: "subscription_plan_resync", subscriptionId: "sub_1", source: "customer.subscription.updated" });
});

test("subscription.updated with a plan_key metadata change routes to resync", () => {
  const a = classifyStripeEvent(evt("customer.subscription.updated", talentSub, { metadata: { plan_key: "talent_pro" } }));
  assert.equal(a.kind, "subscription_plan_resync");
});

test("other updates keep the lifecycle routing", () => {
  assert.equal(classifyStripeEvent(evt("customer.subscription.updated", talentSub, { status: "past_due" })).kind, "subscription_lifecycle_talent");
  assert.equal(classifyStripeEvent(evt("customer.subscription.updated", talentSub)).kind, "subscription_lifecycle_talent");
  assert.equal(classifyStripeEvent(evt("customer.subscription.deleted", talentSub, { items: {} })).kind, "subscription_lifecycle_talent");
});

for (const type of [
  "subscription_schedule.created",
  "subscription_schedule.updated",
  "subscription_schedule.released",
  "subscription_schedule.canceled",
  "subscription_schedule.completed",
  "subscription_schedule.aborted",
]) {
  test(`${type} with a subscription routes to resync`, () => {
    const a = classifyStripeEvent(evt(type, { id: "sub_sched_1", subscription: "sub_1" }));
    assert.deepEqual(a, { kind: "subscription_plan_resync", subscriptionId: "sub_1", source: type });
  });
}

test("released schedule falls back to released_subscription; none = ignore", () => {
  const a = classifyStripeEvent(evt("subscription_schedule.released", { id: "s", subscription: null, released_subscription: "sub_9" }));
  assert.equal(a.kind === "subscription_plan_resync" && a.subscriptionId, "sub_9");
  assert.equal(classifyStripeEvent(evt("subscription_schedule.created", { id: "s", subscription: null })).kind, "ignore");
});

test("replay of a price-change event: same action, same write, plan change reported once", () => {
  const e = evt("customer.subscription.updated", talentSub, { items: { data: [] } });
  assert.deepEqual(classifyStripeEvent(e), classifyStripeEvent(e));
  assert.equal(isPlanChangeUpdate(e), true);

  // The handler re-fetches, so both deliveries feed the LIVE subscription
  // (talent_portfolio) into the single writer.
  const first = decideTalentPlanState({
    eventType: "sync",
    subscriptionId: "sub_1",
    status: "active",
    planKey: "talent_portfolio",
    existing: { status: "active", plan_key: "talent_pro", stripe_subscription_id: "sub_1" },
    previousProfilePlan: "talent_pro",
  });
  assert.deepEqual(first, { kind: "write", rowPlan: "talent_portfolio", profilePlan: "talent_portfolio", status: "active", planChanged: true });
  const replay = decideTalentPlanState({
    eventType: "sync",
    subscriptionId: "sub_1",
    status: "active",
    planKey: "talent_portfolio",
    existing: { status: "active", plan_key: "talent_portfolio", stripe_subscription_id: "sub_1" },
    previousProfilePlan: "talent_portfolio",
  });
  assert.equal(replay.kind === "write" && replay.rowPlan, "talent_portfolio");
  assert.equal(replay.kind === "write" && replay.planChanged, false);
});
