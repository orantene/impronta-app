/**
 * TUL-831 · the webhook that mirrors the talent plan applies a downgrade only when the new phase starts (or the
 * subscription ends for Free). A pending change must never take features away early.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";

import { decideTalentPlanState } from "@/lib/billing/talent-plan-state";
import { planKeyFromSubscription } from "./stripe-talent-subscription";

function sub(over: { plan?: string; price?: string; cancelAtPeriodEnd?: boolean; schedule?: string | null }): Stripe.Subscription {
  return {
    id: "sub_1",
    metadata: { plan_key: over.plan ?? "talent_portfolio", talent_profile_id: "tp_1" },
    cancel_at_period_end: over.cancelAtPeriodEnd ?? false,
    schedule: over.schedule ?? null,
    items: { data: [{ price: { id: over.price ?? "price_portfolio_month", product: "prod_x" } }] },
  } as unknown as Stripe.Subscription;
}

const existing = { status: "active", plan_key: "talent_portfolio", stripe_subscription_id: "sub_1" };

function decide(s: Stripe.Subscription, status = "active", eventType = "customer.subscription.updated") {
  return decideTalentPlanState({
    eventType,
    subscriptionId: s.id,
    status,
    planKey: planKeyFromSubscription(s) ?? "talent_pro",
    existing,
    previousProfilePlan: "talent_portfolio",
  });
}

test("a scheduled lower plan changes nothing while phase 1 runs (metadata still names the current plan)", () => {
  const d = decide(sub({ schedule: "sub_sched_1" }));
  assert.equal(d.kind, "write");
  assert.ok(d.kind === "write");
  assert.equal(d.profilePlan, "talent_portfolio");
  assert.equal(d.planChanged, false);
});

test("a pending switch to Free keeps paid access until the subscription ends", () => {
  const d = decide(sub({ cancelAtPeriodEnd: true }));
  assert.ok(d.kind === "write");
  assert.equal(d.profilePlan, "talent_portfolio");
  assert.equal(d.planChanged, false);
});

test("when the new phase starts Stripe stamps the new plan: only then does the profile drop to it", () => {
  const started = sub({ plan: "talent_pro", price: "price_pro_month" });
  assert.equal(planKeyFromSubscription(started), "talent_pro");
  const d = decide(started);
  assert.ok(d.kind === "write");
  assert.equal(d.profilePlan, "talent_pro");
  assert.equal(d.planChanged, true);
});

test("the end of a switch to Free arrives as customer.subscription.deleted and drops the profile to Free", () => {
  const d = decide(sub({ cancelAtPeriodEnd: true }), "cancelled", "customer.subscription.deleted");
  assert.ok(d.kind === "write");
  assert.equal(d.profilePlan, "talent_basic");
  assert.equal(d.planChanged, true);
});

test("cancelling the change before the period ends (flag cleared) leaves the plan untouched", () => {
  const d = decide(sub({ cancelAtPeriodEnd: false }));
  assert.ok(d.kind === "write");
  assert.equal(d.planChanged, false);
  assert.equal(d.profilePlan, "talent_portfolio");
});
