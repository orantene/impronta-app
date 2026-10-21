import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type Stripe from "stripe";
import { autopayStatusOf, classifyRentSubscriptionEvent, periodOfSeconds } from "./rent-autopay-routing";

const md = { checkout_type: "rent_subscription", rent_plan_id: "plan-1", tenant_id: "t-1", talent_profile_id: "tp-1", rent_cents: "120000" };
const ev = (type: string, object: Record<string, unknown>) => ({ type, data: { object } }) as unknown as Stripe.Event;
const OCT1 = Date.UTC(2026, 9, 1) / 1000;

describe("only rent subscriptions are routed here; everything else is left alone", () => {
  test("a plan subscription checkout is not a rent event", () => {
    assert.equal(classifyRentSubscriptionEvent(ev("checkout.session.completed", { mode: "subscription", subscription: "sub_1", metadata: { checkout_type: "talent_subscription" } })), null);
    assert.equal(classifyRentSubscriptionEvent(ev("invoice.paid", { id: "in_1", amount_paid: 100, parent: { subscription_details: { subscription: "sub_1", metadata: { checkout_type: "workspace_subscription" } } } })), null);
  });
  test("bad or missing rent metadata is ignored (fail closed)", () => {
    for (const bad of [{ ...md, rent_plan_id: "" }, { ...md, rent_cents: "-1" }, { ...md, rent_cents: "x" }, { ...md, tenant_id: "" }]) {
      assert.equal(classifyRentSubscriptionEvent(ev("customer.subscription.updated", { id: "sub_1", status: "active", metadata: bad })), null);
    }
  });
});

describe("rent events", () => {
  test("checkout completed starts autopay with the subscription id", () => {
    assert.deepEqual(classifyRentSubscriptionEvent(ev("checkout.session.completed", { mode: "subscription", subscription: "sub_1", customer: "cus_1", metadata: md })), { type: "started", planId: "plan-1", tenantId: "t-1", subscriptionId: "sub_1", customerId: "cus_1" });
  });
  test("a paid invoice carries the period it paid for and the frozen rent", () => {
    const r = classifyRentSubscriptionEvent(ev("invoice.paid", { id: "in_9", amount_paid: 121_800, currency: "mxn", period_start: 1, lines: { data: [{ period: { start: OCT1 } }] }, parent: { subscription_details: { subscription: "sub_1", metadata: md } } }));
    assert.deepEqual(r, { type: "paid", planId: "plan-1", tenantId: "t-1", subscriptionId: "sub_1", invoiceId: "in_9", periodStart: OCT1, amountPaid: 121_800, currency: "mxn", rentCents: 120_000 });
    assert.equal(periodOfSeconds(OCT1), "2026-10");
  });
  test("the zero sign-up invoice is not a payment", () => {
    assert.equal(classifyRentSubscriptionEvent(ev("invoice.paid", { id: "in_0", amount_paid: 0, parent: { subscription_details: { subscription: "sub_1", metadata: md } } })), null);
  });
  test("a failed charge carries the attempt", () => {
    const r = classifyRentSubscriptionEvent(ev("invoice.payment_failed", { id: "in_9", attempt_count: 2, period_start: OCT1, parent: { subscription_details: { subscription: "sub_1", metadata: md } } }));
    assert.equal(r?.type, "failed");
    assert.equal(r?.type === "failed" && r.attempt, 2);
  });
  test("subscription status maps to the plan's autopay status", () => {
    assert.equal(autopayStatusOf({ stripeStatus: "active", paused: false, deleted: false }), "active");
    assert.equal(autopayStatusOf({ stripeStatus: "active", paused: true, deleted: false }), "paused");
    assert.equal(autopayStatusOf({ stripeStatus: "past_due", paused: false, deleted: false }), "past_due");
    assert.equal(autopayStatusOf({ stripeStatus: "unpaid", paused: false, deleted: false }), "past_due");
    assert.equal(autopayStatusOf({ stripeStatus: "active", paused: false, deleted: true }), "canceled");
    assert.equal(autopayStatusOf({ stripeStatus: "incomplete", paused: false, deleted: false }), "pending");
  });
});
