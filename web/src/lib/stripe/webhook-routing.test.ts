import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";

import { classifyStripeEvent, interpretClaimError, type StripeAction } from "./webhook-routing";

/**
 * These tests are the P0 guarantee behind the webhook unification: every Stripe
 * event type the platform cares about must route to exactly one action, and NO
 * money flow may silently fall through to `ignore`. Two route URLs delegate to
 * the same classifier, so proving the classifier here proves both endpoints.
 *
 * `classifyStripeEvent` is pure (no I/O), so we can assert the full event→action
 * mapping with hand-built event fixtures and zero mocking.
 */

// Minimal Stripe.Event builder. The classifier only reads `type`,
// `data.object`, the envelope `account`, and (for invalid/log messages) `id`.
function evt(
  type: string,
  object: Record<string, unknown>,
  envelope: Record<string, unknown> = {},
): Stripe.Event {
  return {
    id: "evt_test_1",
    type,
    api_version: "2026-04-22.dahlia",
    livemode: false,
    data: { object },
    ...envelope,
  } as unknown as Stripe.Event;
}

// Narrowing helper: assert the action kind and return it typed.
function expectKind<K extends StripeAction["kind"]>(
  action: StripeAction,
  kind: K,
): Extract<StripeAction, { kind: K }> {
  assert.equal(action.kind, kind, `expected action.kind=${kind}, got ${action.kind}`);
  return action as Extract<StripeAction, { kind: K }>;
}

// ─── checkout.session.completed — one-time payment modes ──────────────────────

test("checkout payment: client_verification with user+tenant → client_verification", () => {
  const a = classifyStripeEvent(
    evt("checkout.session.completed", {
      id: "cs_1",
      mode: "payment",
      metadata: { checkout_type: "client_verification", user_id: "u1", tenant_id: "t1" },
    }),
  );
  const action = expectKind(a, "client_verification");
  assert.equal(action.userId, "u1");
  assert.equal(action.tenantId, "t1");
  assert.equal(action.sessionId, "cs_1");
});

test("checkout payment: client_verification missing tenant → invalid (not dropped)", () => {
  const a = classifyStripeEvent(
    evt("checkout.session.completed", {
      id: "cs_1",
      mode: "payment",
      metadata: { checkout_type: "client_verification", user_id: "u1" },
    }),
  );
  expectKind(a, "invalid");
});

test("checkout payment: client_balance_topup → client_balance_topup with amount + PI id", () => {
  const a = classifyStripeEvent(
    evt("checkout.session.completed", {
      id: "cs_2",
      mode: "payment",
      payment_intent: "pi_99",
      metadata: {
        checkout_type: "client_balance_topup",
        user_id: "u1",
        tenant_id: "t1",
        amount_cents: "25000",
      },
    }),
  );
  const action = expectKind(a, "client_balance_topup");
  assert.equal(action.amountCents, 25000);
  assert.equal(action.paymentIntentId, "pi_99");
  assert.equal(action.userId, "u1");
  assert.equal(action.tenantId, "t1");
});

test("checkout payment: client_balance_topup with expanded PI object → id extracted", () => {
  const a = classifyStripeEvent(
    evt("checkout.session.completed", {
      id: "cs_2b",
      mode: "payment",
      payment_intent: { id: "pi_obj" },
      metadata: {
        checkout_type: "client_balance_topup",
        user_id: "u1",
        tenant_id: "t1",
        amount_cents: "10000",
      },
    }),
  );
  const action = expectKind(a, "client_balance_topup");
  assert.equal(action.paymentIntentId, "pi_obj");
});

test("checkout payment: client_balance_topup with zero amount → invalid", () => {
  const a = classifyStripeEvent(
    evt("checkout.session.completed", {
      id: "cs_3",
      mode: "payment",
      metadata: {
        checkout_type: "client_balance_topup",
        user_id: "u1",
        tenant_id: "t1",
        amount_cents: "0",
      },
    }),
  );
  expectKind(a, "invalid");
});

test("checkout payment: BOOKING invoice via client_reference_id → booking_payment (folded from route B)", () => {
  const a = classifyStripeEvent(
    evt("checkout.session.completed", {
      id: "cs_4",
      mode: "payment",
      client_reference_id: "txn_abc",
      metadata: {},
    }),
  );
  const action = expectKind(a, "booking_payment");
  assert.equal(action.transactionId, "txn_abc");
});

test("checkout payment: BOOKING invoice via metadata.transaction_id → booking_payment", () => {
  const a = classifyStripeEvent(
    evt("checkout.session.completed", {
      id: "cs_5",
      mode: "payment",
      client_reference_id: null,
      metadata: { transaction_id: "txn_xyz" },
    }),
  );
  const action = expectKind(a, "booking_payment");
  assert.equal(action.transactionId, "txn_xyz");
});

test("checkout payment: no recognizable routing key → invalid (never silently ignored)", () => {
  const a = classifyStripeEvent(
    evt("checkout.session.completed", { id: "cs_6", mode: "payment", metadata: {} }),
  );
  expectKind(a, "invalid");
});

// ─── checkout.session.completed — subscription mode ───────────────────────────

test("checkout subscription: with subscription id → subscription_checkout", () => {
  const a = classifyStripeEvent(
    evt("checkout.session.completed", {
      id: "cs_7",
      mode: "subscription",
      subscription: "sub_123",
      metadata: { checkout_type: "workspace_subscription", plan_key: "studio" },
    }),
  );
  const action = expectKind(a, "subscription_checkout");
  assert.equal(action.subscriptionId, "sub_123");
});

test("checkout subscription: expanded subscription object → id extracted", () => {
  const a = classifyStripeEvent(
    evt("checkout.session.completed", {
      id: "cs_7b",
      mode: "subscription",
      subscription: { id: "sub_obj" },
    }),
  );
  const action = expectKind(a, "subscription_checkout");
  assert.equal(action.subscriptionId, "sub_obj");
});

test("checkout subscription: no subscription id → invalid", () => {
  const a = classifyStripeEvent(
    evt("checkout.session.completed", { id: "cs_8", mode: "subscription" }),
  );
  expectKind(a, "invalid");
});

test("checkout other mode (setup) → ignore", () => {
  const a = classifyStripeEvent(
    evt("checkout.session.completed", { id: "cs_9", mode: "setup" }),
  );
  expectKind(a, "ignore");
});

// ─── customer.subscription.updated / deleted — talent vs workspace ────────────

test("subscription.updated talent via talent_plan_key → subscription_lifecycle_talent", () => {
  const a = classifyStripeEvent(
    evt("customer.subscription.updated", {
      id: "sub_t",
      metadata: { talent_plan_key: "talent_pro" },
    }),
  );
  expectKind(a, "subscription_lifecycle_talent");
});

test("subscription.updated talent via checkout_type → subscription_lifecycle_talent", () => {
  const a = classifyStripeEvent(
    evt("customer.subscription.updated", {
      id: "sub_t2",
      metadata: { checkout_type: "talent_subscription" },
    }),
  );
  expectKind(a, "subscription_lifecycle_talent");
});

test("subscription.deleted talent via talent_profile_id → subscription_lifecycle_talent", () => {
  const a = classifyStripeEvent(
    evt("customer.subscription.deleted", {
      id: "sub_t3",
      metadata: { talent_profile_id: "tp_1" },
    }),
  );
  expectKind(a, "subscription_lifecycle_talent");
});

test("subscription.updated workspace via checkout_type → subscription_lifecycle_workspace", () => {
  const a = classifyStripeEvent(
    evt("customer.subscription.updated", {
      id: "sub_w",
      metadata: { checkout_type: "workspace_subscription", plan_key: "agency" },
    }),
  );
  const action = expectKind(a, "subscription_lifecycle_workspace");
  assert.equal(action.planKey, "agency");
});

test("subscription workspace checkout_type without plan_key → defaults to studio", () => {
  const a = classifyStripeEvent(
    evt("customer.subscription.updated", {
      id: "sub_w2",
      metadata: { checkout_type: "workspace_subscription" },
    }),
  );
  const action = expectKind(a, "subscription_lifecycle_workspace");
  assert.equal(action.planKey, "studio");
});

test("subscription.deleted legacy workspace via plan_key only → subscription_lifecycle_workspace", () => {
  const a = classifyStripeEvent(
    evt("customer.subscription.deleted", {
      id: "sub_w3",
      metadata: { plan_key: "network" },
    }),
  );
  const action = expectKind(a, "subscription_lifecycle_workspace");
  assert.equal(action.planKey, "network");
});

test("subscription with no routing key → subscription_unknown (logged, never misrouted to workspace)", () => {
  const a = classifyStripeEvent(
    evt("customer.subscription.updated", { id: "sub_u", metadata: {} }),
  );
  const action = expectKind(a, "subscription_unknown");
  assert.equal(action.checkoutType, null);
  assert.equal(action.planKey, null);
});

test("trial_will_end → trial_will_end with subscription id + trial_end", () => {
  const a = classifyStripeEvent(
    evt("customer.subscription.trial_will_end", { id: "sub_tr", trial_end: 1893456000 }),
  );
  const action = expectKind(a, "trial_will_end");
  assert.equal(action.subscriptionId, "sub_tr");
  assert.equal(action.trialEnd, 1893456000);
});

// ─── invoice events ───────────────────────────────────────────────────────────

test("invoice.payment_failed with parent subscription → invoice_payment_failed", () => {
  const a = classifyStripeEvent(
    evt("invoice.payment_failed", {
      id: "in_1",
      parent: { subscription_details: { subscription: "sub_x" } },
    }),
  );
  const action = expectKind(a, "invoice_payment_failed");
  assert.equal(action.subscriptionId, "sub_x");
});

test("invoice.payment_failed with expanded subscription object → id extracted", () => {
  const a = classifyStripeEvent(
    evt("invoice.payment_failed", {
      id: "in_1b",
      parent: { subscription_details: { subscription: { id: "sub_xo" } } },
    }),
  );
  const action = expectKind(a, "invoice_payment_failed");
  assert.equal(action.subscriptionId, "sub_xo");
});

test("invoice.payment_failed without parent subscription → invalid", () => {
  const a = classifyStripeEvent(evt("invoice.payment_failed", { id: "in_2" }));
  expectKind(a, "invalid");
});

test("invoice.payment_succeeded → invoice_payment_succeeded (audit log)", () => {
  const a = classifyStripeEvent(
    evt("invoice.payment_succeeded", {
      id: "in_3",
      customer: "cus_1",
      amount_paid: 1200,
      currency: "usd",
    }),
  );
  const action = expectKind(a, "invoice_payment_succeeded");
  assert.equal(action.customerId, "cus_1");
  assert.equal(action.amountPaid, 1200);
  assert.equal(action.currency, "usd");
});

// ─── charge events ─────────────────────────────────────────────────────────────

test("charge.refunded with PI + positive refund → charge_refunded", () => {
  const a = classifyStripeEvent(
    evt("charge.refunded", {
      id: "ch_1",
      payment_intent: "pi_ref",
      amount_refunded: 5000,
    }),
  );
  const action = expectKind(a, "charge_refunded");
  assert.equal(action.paymentIntentId, "pi_ref");
  assert.equal(action.refundedCents, 5000);
  assert.equal(action.chargeId, "ch_1");
});

test("charge.refunded without payment_intent → ignore (not a tracked top-up)", () => {
  const a = classifyStripeEvent(
    evt("charge.refunded", { id: "ch_2", amount_refunded: 5000 }),
  );
  expectKind(a, "ignore");
});

test("charge.refunded with zero refunded → ignore", () => {
  const a = classifyStripeEvent(
    evt("charge.refunded", { id: "ch_3", payment_intent: "pi_x", amount_refunded: 0 }),
  );
  expectKind(a, "ignore");
});

test("charge.dispute.created → charge_dispute", () => {
  const a = classifyStripeEvent(
    evt("charge.dispute.created", {
      id: "dp_1",
      amount: 9900,
      reason: "fraudulent",
      status: "warning_needs_response",
    }),
  );
  const action = expectKind(a, "charge_dispute");
  assert.equal(action.disputeId, "dp_1");
  assert.equal(action.amount, 9900);
  assert.equal(action.reason, "fraudulent");
  assert.equal(action.status, "warning_needs_response");
});

// ─── payment_intent events ──────────────────────────────────────────────────────

test("payment_intent.succeeded purpose=booking_deposit → booking_deposit (currency uppercased)", () => {
  const a = classifyStripeEvent(
    evt("payment_intent.succeeded", {
      id: "pi_dep",
      amount: 30000,
      currency: "usd",
      metadata: { purpose: "booking_deposit", booking_id: "bk_1" },
    }),
  );
  const action = expectKind(a, "booking_deposit");
  assert.equal(action.bookingId, "bk_1");
  assert.equal(action.amountCents, 30000);
  assert.equal(action.currency, "USD");
  assert.equal(action.paymentIntentId, "pi_dep");
});

test("payment_intent.succeeded booking_deposit missing booking_id → invalid", () => {
  const a = classifyStripeEvent(
    evt("payment_intent.succeeded", {
      id: "pi_dep2",
      amount: 30000,
      currency: "usd",
      metadata: { purpose: "booking_deposit" },
    }),
  );
  expectKind(a, "invalid");
});

test("payment_intent.succeeded without booking_deposit purpose → ignore", () => {
  const a = classifyStripeEvent(
    evt("payment_intent.succeeded", { id: "pi_other", metadata: { purpose: "something_else" } }),
  );
  expectKind(a, "ignore");
});

test("payment_intent.payment_failed → payment_intent_failed with transaction id", () => {
  const a = classifyStripeEvent(
    evt("payment_intent.payment_failed", {
      id: "pi_f",
      metadata: { transaction_id: "txn_f" },
    }),
  );
  const action = expectKind(a, "payment_intent_failed");
  assert.equal(action.transactionId, "txn_f");
});

test("payment_intent.payment_failed without transaction id → payment_intent_failed(null)", () => {
  const a = classifyStripeEvent(evt("payment_intent.payment_failed", { id: "pi_f2", metadata: {} }));
  const action = expectKind(a, "payment_intent_failed");
  assert.equal(action.transactionId, null);
});

// ─── Connect account events ──────────────────────────────────────────────────────

test("account.updated → connect_account_updated", () => {
  const a = classifyStripeEvent(evt("account.updated", { id: "acct_1" }));
  const action = expectKind(a, "connect_account_updated");
  assert.equal(action.accountId, "acct_1");
});

test("account.updated with empty id → ignore", () => {
  const a = classifyStripeEvent(evt("account.updated", { id: "" }));
  expectKind(a, "ignore");
});

test("capability.updated with envelope account → capability_updated", () => {
  const a = classifyStripeEvent(
    evt("capability.updated", { id: "card_payments", account: "acct_env" }, { account: "acct_env" }),
  );
  const action = expectKind(a, "capability_updated");
  assert.equal(action.accountId, "acct_env");
});

test("capability.updated falls back to capability.account when envelope account missing", () => {
  const a = classifyStripeEvent(
    evt("capability.updated", { id: "transfers", account: "acct_cap" }),
  );
  const action = expectKind(a, "capability_updated");
  assert.equal(action.accountId, "acct_cap");
});

test("capability.updated with no account anywhere → ignore", () => {
  const a = classifyStripeEvent(evt("capability.updated", { id: "transfers" }));
  expectKind(a, "ignore");
});

// ─── payout events ───────────────────────────────────────────────────────────────

for (const type of ["payout.paid", "payout.failed", "payout.created", "payout.canceled"] as const) {
  test(`${type} → payout_event`, () => {
    const a = classifyStripeEvent(
      evt(type, { id: "po_1", amount: 12345, currency: "eur" }, { account: "acct_p" }),
    );
    const action = expectKind(a, "payout_event");
    assert.equal(action.eventType, type);
    assert.equal(action.payoutId, "po_1");
    assert.equal(action.accountId, "acct_p");
    assert.equal(action.amount, 12345);
    assert.equal(action.currency, "eur");
  });
}

// ─── unhandled ──────────────────────────────────────────────────────────────────

test("unknown event type → ignore", () => {
  const a = classifyStripeEvent(evt("radar.early_fraud_warning.created", { id: "issfr_1" }));
  expectKind(a, "ignore");
});

// ─── money-flow coverage guard ────────────────────────────────────────────────────
// Belt-and-suspenders: assert each REVENUE-affecting flow is reachable and never
// resolves to `ignore`/`invalid` for its happy-path fixture. If a future edit
// accidentally drops one of these branches, this single test fails loudly.

test("all revenue flows are reachable (none silently ignored on happy path)", () => {
  const cases: Array<[Stripe.Event, StripeAction["kind"]]> = [
    [
      evt("checkout.session.completed", {
        id: "cs",
        mode: "payment",
        metadata: { checkout_type: "client_verification", user_id: "u", tenant_id: "t" },
      }),
      "client_verification",
    ],
    [
      evt("checkout.session.completed", {
        id: "cs",
        mode: "payment",
        metadata: { checkout_type: "client_balance_topup", user_id: "u", tenant_id: "t", amount_cents: "100" },
      }),
      "client_balance_topup",
    ],
    [
      evt("checkout.session.completed", { id: "cs", mode: "payment", client_reference_id: "txn" }),
      "booking_payment",
    ],
    [
      evt("checkout.session.completed", { id: "cs", mode: "subscription", subscription: "sub" }),
      "subscription_checkout",
    ],
    [
      evt("payment_intent.succeeded", {
        id: "pi",
        amount: 1,
        currency: "usd",
        metadata: { purpose: "booking_deposit", booking_id: "bk" },
      }),
      "booking_deposit",
    ],
    [
      evt("charge.refunded", { id: "ch", payment_intent: "pi", amount_refunded: 1 }),
      "charge_refunded",
    ],
    [
      evt("customer.subscription.deleted", { id: "sub", metadata: { talent_plan_key: "talent_pro" } }),
      "subscription_lifecycle_talent",
    ],
    [
      evt("customer.subscription.deleted", { id: "sub", metadata: { checkout_type: "workspace_subscription" } }),
      "subscription_lifecycle_workspace",
    ],
  ];
  for (const [event, kind] of cases) {
    const action = classifyStripeEvent(event);
    assert.equal(action.kind, kind, `${event.type} should route to ${kind}, got ${action.kind}`);
  }
});

// ─── interpretClaimError ──────────────────────────────────────────────────────────

test("interpretClaimError: 23505 → duplicate", () => {
  assert.equal(interpretClaimError({ code: "23505" }), "duplicate");
});

test("interpretClaimError: other code → other", () => {
  assert.equal(interpretClaimError({ code: "42P01" }), "other");
});

test("interpretClaimError: null → other", () => {
  assert.equal(interpretClaimError(null), "other");
});

test("interpretClaimError: missing code → other", () => {
  assert.equal(interpretClaimError({}), "other");
});
