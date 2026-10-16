import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";

import { classifyStripeEvent } from "./webhook-routing";

/**
 * TUL-836: customer.subscription.created must reach the same plan-state
 * writer as updated/deleted. Before this it fell through to `ignore`, so a
 * subscription created outside our checkout never landed in the plan row.
 */
function created(metadata: Record<string, string>): Stripe.Event {
  return {
    id: "evt_test_created",
    object: "event",
    type: "customer.subscription.created",
    data: { object: { id: "sub_test", object: "subscription", metadata } },
  } as unknown as Stripe.Event;
}

test("created talent subscription routes to the talent lifecycle", () => {
  const a = classifyStripeEvent(created({ checkout_type: "talent_subscription", plan_key: "talent_pro" }));
  assert.equal(a.kind, "subscription_lifecycle_talent");
});

test("created workspace subscription routes to the workspace lifecycle", () => {
  const a = classifyStripeEvent(created({ checkout_type: "workspace_subscription", plan_key: "studio" }));
  assert.equal(a.kind, "subscription_lifecycle_workspace");
});

test("created subscription we do not own is reported, not ignored", () => {
  const a = classifyStripeEvent(created({}));
  assert.equal(a.kind, "subscription_unknown");
});
