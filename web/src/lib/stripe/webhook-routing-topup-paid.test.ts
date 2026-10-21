import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";

import { classifyStripeEvent, type StripeAction } from "./webhook-routing";

/**
 * TUL-1307: a balance top-up must credit what the customer actually PAID
 * (Checkout `amount_total`, after promo discounts), never the requested
 * `metadata.amount_cents`. Otherwise a promo code mints free balance.
 */

interface TopupSessionOverrides {
  amount_total?: number | null;
  currency?: string | null;
  amount_cents?: string;
  payment_intent?: string;
}

function topupEvent(o: TopupSessionOverrides = {}): Stripe.Event {
  const session: Record<string, unknown> = {
    id: "cs_topup",
    mode: "payment",
    payment_intent: o.payment_intent ?? "pi_topup",
    metadata: {
      checkout_type: "client_balance_topup",
      user_id: "u1",
      tenant_id: "t1",
      amount_cents: o.amount_cents ?? "10000",
    },
  };
  if (o.amount_total !== undefined) session.amount_total = o.amount_total;
  session.currency = o.currency === undefined ? "usd" : o.currency;
  return {
    id: "evt_topup",
    type: "checkout.session.completed",
    api_version: "2026-04-22.dahlia",
    livemode: false,
    data: { object: session },
  } as unknown as Stripe.Event;
}

function topup(action: StripeAction): Extract<StripeAction, { kind: "client_balance_topup" }> {
  assert.equal(action.kind, "client_balance_topup", `got ${JSON.stringify(action)}`);
  return action as Extract<StripeAction, { kind: "client_balance_topup" }>;
}

test("topup: no promo, paid equals requested -> credits requested amount", () => {
  const a = topup(classifyStripeEvent(topupEvent({ amount_total: 10000 })));
  assert.equal(a.amountCents, 10000);
  assert.equal(a.paymentIntentId, "pi_topup");
});

test("topup: promo-discounted checkout credits the discounted amount paid", () => {
  const a = topup(classifyStripeEvent(topupEvent({ amount_total: 7500, amount_cents: "10000" })));
  assert.equal(a.amountCents, 7500);
});

test("topup: 100%-off checkout credits nothing (refused as invalid)", () => {
  const a = classifyStripeEvent(topupEvent({ amount_total: 0, amount_cents: "10000" }));
  assert.equal(a.kind, "invalid");
});

test("topup: missing amount_total fails closed (never falls back to metadata)", () => {
  const a = classifyStripeEvent(topupEvent({ amount_cents: "10000" }));
  assert.equal(a.kind, "invalid");
  const b = classifyStripeEvent(topupEvent({ amount_total: null, amount_cents: "10000" }));
  assert.equal(b.kind, "invalid");
});

test("topup: non-USD session currency fails closed (ledger is USD cents)", () => {
  const a = classifyStripeEvent(topupEvent({ amount_total: 10000, currency: "mxn" }));
  assert.equal(a.kind, "invalid");
});

test("topup: paid above requested never credits more than requested (tax/fees are not balance)", () => {
  const a = topup(classifyStripeEvent(topupEvent({ amount_total: 10800, amount_cents: "10000" })));
  assert.equal(a.amountCents, 10000);
});

test("topup: replay classifies identically (credit idempotency key unchanged)", () => {
  const first = topup(classifyStripeEvent(topupEvent({ amount_total: 7500 })));
  const second = topup(classifyStripeEvent(topupEvent({ amount_total: 7500 })));
  assert.deepEqual(first, second);
  assert.equal(second.paymentIntentId, "pi_topup");
});
