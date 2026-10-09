import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";

import { classifyStripeEvent, type StripeAction } from "./webhook-routing";

/** D5 (TUL-526): a paid domain-renewal Checkout routes to its own action, never the purchase path. */

function evt(type: string, object: Record<string, unknown>): Stripe.Event {
  return { id: "evt_test_1", type, api_version: "2026-04-22.dahlia", livemode: false, data: { object } } as unknown as Stripe.Event;
}

function expectKind<K extends StripeAction["kind"]>(action: StripeAction, kind: K): Extract<StripeAction, { kind: K }> {
  assert.equal(action.kind, kind, `expected action.kind=${kind}, got ${action.kind}`);
  return action as Extract<StripeAction, { kind: K }>;
}

test("checkout payment: talent_domain_renewal → talent_domain_renewal (settled by the renewal path, not the purchase path)", () => {
  const paid = classifyStripeEvent(
    evt("checkout.session.completed", {
      id: "cs_renew_1",
      mode: "payment",
      payment_status: "paid",
      amount_total: 1499,
      currency: "usd",
      payment_intent: "pi_renew_1",
      metadata: { checkout_type: "talent_domain_renewal", talent_id: "tal_abc", domain: "mysite.com", domain_row_id: "row-1" },
    }),
  );
  const action = expectKind(paid, "talent_domain_renewal");
  assert.deepEqual(
    { s: action.sessionId, r: action.domainRowId, a: action.amountTotal, c: action.currency, p: action.paymentIntentId },
    { s: "cs_renew_1", r: "row-1", a: 1499, c: "usd", p: "pi_renew_1" },
  );
  const unpaid = classifyStripeEvent(
    evt("checkout.session.completed", {
      id: "cs_renew_2",
      mode: "payment",
      payment_status: "unpaid",
      metadata: { checkout_type: "talent_domain_renewal", domain_row_id: "row-1" },
    }),
  );
  expectKind(unpaid, "ignore");
  const bad = classifyStripeEvent(
    evt("checkout.session.completed", {
      id: "cs_renew_3",
      mode: "payment",
      payment_status: "paid",
      metadata: { checkout_type: "talent_domain_renewal" },
    }),
  );
  expectKind(bad, "invalid");
});
