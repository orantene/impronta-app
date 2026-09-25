import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";

import { classifyStripeEvent, type StripeAction } from "./webhook-routing";

/**
 * Payment-link Checkout routing (audit 2026-09-25, defects #1-#2). Split from
 * `webhook-routing.test.ts` (its 800-line budget); same pure classifier, same
 * fixture style: hand-built events, zero mocking.
 */

function evt(type: string, object: Record<string, unknown>): Stripe.Event {
  return {
    id: "evt_test_link",
    type,
    api_version: "2026-04-22.dahlia",
    livemode: false,
    data: { object },
  } as unknown as Stripe.Event;
}

function expectKind<K extends StripeAction["kind"]>(
  action: StripeAction,
  kind: K,
): Extract<StripeAction, { kind: K }> {
  assert.equal(action.kind, kind, `expected action.kind=${kind}, got ${action.kind}`);
  return action as Extract<StripeAction, { kind: K }>;
}

// ─── payment links (audit 2026-09-25, defect #1) ────────────────────────────────
// A payment link's session is the shape `openPaymentLinkCheckout` mints: the
// money row on `client_reference_id`, the link's code as tracing metadata.

const LINK_SESSION = {
  id: "cs_test_link_1",
  mode: "payment",
  status: "complete",
  payment_status: "paid",
  client_reference_id: "txn_link_1",
  payment_intent: "pi_link_1",
  amount_total: 1800,
  currency: "usd",
  metadata: { transaction_id: "txn_link_1", booking_id: "bk_1", payment_link_code: "AbCdEfGh" },
};

test("payment link: completed session settles through markPaid with its PaymentIntent", () => {
  const action = expectKind(classifyStripeEvent(evt("checkout.session.completed", LINK_SESSION)), "booking_payment");
  assert.equal(action.transactionId, "txn_link_1");
  assert.equal(action.paymentIntentId, "pi_link_1", "stored so the refund route can find the charge");
});

test("payment link: the same event classified twice is the same single settle", () => {
  const event = evt("checkout.session.completed", LINK_SESSION);
  assert.deepEqual(classifyStripeEvent(event), classifyStripeEvent(event));
});

test("payment link: a pre-fix session (code only, no money row) is named for reconciliation, not lost", () => {
  const a = classifyStripeEvent(
    evt("checkout.session.completed", {
      id: "cs_legacy",
      mode: "payment",
      metadata: { payment_link_code: "AbCdEfGh", order_id: "o1", tenant_id: "t1" },
    }),
  );
  const action = expectKind(a, "invalid");
  assert.match(action.reason, /PAYMENT LINK CHARGED BUT NOT SETTLED/);
  assert.match(action.reason, /AbCdEfGh/);
});

test("payment link: expired session → checkout_session_closed(expired)", () => {
  const a = classifyStripeEvent(
    evt("checkout.session.expired", { ...LINK_SESSION, status: "expired", payment_status: "unpaid", payment_intent: null }),
  );
  const action = expectKind(a, "checkout_session_closed");
  assert.equal(action.transactionId, "txn_link_1");
  assert.equal(action.reason, "expired");
});

test("expired session with no money row → ignore (a link's own timer lapses it)", () => {
  const a = classifyStripeEvent(
    evt("checkout.session.expired", { id: "cs_x", mode: "payment", metadata: { payment_link_code: "AbCdEfGh" } }),
  );
  expectKind(a, "ignore");
});

test("delayed method: completed-but-unpaid waits; async success settles; async failure closes", () => {
  expectKind(
    classifyStripeEvent(evt("checkout.session.completed", { ...LINK_SESSION, payment_status: "unpaid" })),
    "ignore",
  );
  const paid = expectKind(
    classifyStripeEvent(evt("checkout.session.async_payment_succeeded", LINK_SESSION)),
    "booking_payment",
  );
  assert.equal(paid.transactionId, "txn_link_1");
  const failed = expectKind(
    classifyStripeEvent(evt("checkout.session.async_payment_failed", LINK_SESSION)),
    "checkout_session_closed",
  );
  assert.equal(failed.reason, "async_payment_failed");
});
