/**
 * Phase D — client Pro subscription webhook → client_subscriptions upsert mapping.
 *
 * Tests the PURE mapper `mapClientSubscriptionUpsert` (event → upsert shape).
 * No Stripe, no DB. Proves: tier grant on active, downgrade on non-live status,
 * standard on deletion, period-end extraction, and the user_id guard.
 *
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' \
 *      tsx --test src/lib/stripe/client-subscription-webhook.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { mapClientSubscriptionUpsert } from "@/lib/stripe/client-billing";

// Minimal subscription-event builder. The mapper reads event.type and
// event.data.object as a Stripe.Subscription (metadata, customer, status,
// items[0].current_period_end, cancel_at_period_end, id).
function subEvent(
  type: string,
  sub: Record<string, unknown>,
): Stripe.Event {
  return {
    id: "evt_1",
    type,
    data: { object: sub },
  } as unknown as Stripe.Event;
}

const PERIOD_END_UNIX = 1893456000; // 2030-01-01T00:00:00Z
const PERIOD_END_ISO = new Date(PERIOD_END_UNIX * 1000).toISOString();

function activeSub(extra: Record<string, unknown> = {}) {
  return {
    id: "sub_123",
    customer: "cus_123",
    status: "active",
    cancel_at_period_end: false,
    metadata: { user_id: "u1", checkout_type: "client_pro_subscription" },
    items: { data: [{ current_period_end: PERIOD_END_UNIX }] },
    ...extra,
  };
}

test("active subscription.updated → tier=pro, status=active, period end + customer mapped", () => {
  const out = mapClientSubscriptionUpsert(subEvent("customer.subscription.updated", activeSub()));
  assert.ok(out);
  assert.equal(out!.client_user_id, "u1");
  assert.equal(out!.tier, "pro");
  assert.equal(out!.status, "active");
  assert.equal(out!.stripe_customer_id, "cus_123");
  assert.equal(out!.stripe_subscription_id, "sub_123");
  assert.equal(out!.current_period_end, PERIOD_END_ISO);
  assert.equal(out!.cancel_at_period_end, false);
});

test("trialing subscription still grants pro (live status)", () => {
  const out = mapClientSubscriptionUpsert(
    subEvent("customer.subscription.updated", activeSub({ status: "trialing" })),
  );
  assert.equal(out!.tier, "pro");
  assert.equal(out!.status, "trialing");
});

test("past_due downgrades tier to standard but preserves the status", () => {
  const out = mapClientSubscriptionUpsert(
    subEvent("customer.subscription.updated", activeSub({ status: "past_due" })),
  );
  assert.equal(out!.tier, "standard");
  assert.equal(out!.status, "past_due");
});

test("Stripe 'canceled' (US spelling) is normalized to 'canceled' + standard tier", () => {
  const out = mapClientSubscriptionUpsert(
    subEvent("customer.subscription.updated", activeSub({ status: "canceled" })),
  );
  assert.equal(out!.status, "canceled");
  assert.equal(out!.tier, "standard");
});

test("unknown/unsupported Stripe status (e.g. paused) maps to incomplete + standard", () => {
  const out = mapClientSubscriptionUpsert(
    subEvent("customer.subscription.updated", activeSub({ status: "paused" })),
  );
  assert.equal(out!.status, "incomplete");
  assert.equal(out!.tier, "standard");
});

test("customer.subscription.deleted → standard + canceled regardless of incoming status", () => {
  const out = mapClientSubscriptionUpsert(
    subEvent("customer.subscription.deleted", activeSub({ status: "active" })),
  );
  assert.equal(out!.tier, "standard");
  assert.equal(out!.status, "canceled");
  assert.equal(out!.cancel_at_period_end, false);
});

test("enterprise tier honored via metadata when live", () => {
  const out = mapClientSubscriptionUpsert(
    subEvent(
      "customer.subscription.updated",
      activeSub({
        metadata: {
          user_id: "u9",
          checkout_type: "client_pro_subscription",
          client_tier: "enterprise",
        },
      }),
    ),
  );
  assert.equal(out!.tier, "enterprise");
});

test("missing user_id metadata → null (not our subscription; webhook acks)", () => {
  const out = mapClientSubscriptionUpsert(
    subEvent("customer.subscription.updated", activeSub({ metadata: {} })),
  );
  assert.equal(out, null);
});

test("customer as object (not string) → customer id extracted", () => {
  const out = mapClientSubscriptionUpsert(
    subEvent("customer.subscription.updated", activeSub({ customer: { id: "cus_obj" } })),
  );
  assert.equal(out!.stripe_customer_id, "cus_obj");
});

test("no items → current_period_end null (no crash)", () => {
  const out = mapClientSubscriptionUpsert(
    subEvent("customer.subscription.updated", activeSub({ items: { data: [] } })),
  );
  assert.equal(out!.current_period_end, null);
});
