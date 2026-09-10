import { test } from "node:test";
import assert from "node:assert/strict";
import { mapCheckoutSessionState, stripeCollectionAdapter } from "./stripe-collection";
import { reportTerminalAvailability, stripeTerminalSupported } from "./terminal-availability";
import { reportStripeTerminalAvailability } from "./stripe-terminal";

type Call = { params: Record<string, unknown>; options?: { idempotencyKey?: string } };

function fakeStripe() {
  const calls: Call[] = [];
  const client = {
    checkout: {
      sessions: {
        create: async (params: Record<string, unknown>, options?: { idempotencyKey?: string }) => {
          calls.push({ params, options });
          return { id: `cs_${calls.length}`, url: "https://checkout.stripe.test/c/pay/cs_1" };
        },
      },
    },
  };
  return { calls, stripe: client as never };
}

const input = {
  transactionId: "txn_pos_1",
  amountCents: 5000,
  currency: "USD",
  payerEmail: "walkin@example.com",
  inquiryId: null as string | null,
  bookingId: "bk_1",
  successUrl: "https://app.test/ok",
  cancelUrl: "https://app.test/no",
  method: "online_card" as const,
};

test("Stripe adapter creates a Checkout session at the existing boundary", async () => {
  const { calls, stripe } = fakeStripe();
  const out = await stripeCollectionAdapter({ stripe }).createPaymentRequest(input);
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options?.idempotencyKey, "cs_txn_txn_pos_1");
  assert.equal(out.checkoutUrl, "https://checkout.stripe.test/c/pay/cs_1");
  assert.equal(out.state, "pending");
});

test("cash is not opened at Stripe", async () => {
  const { calls, stripe } = fakeStripe();
  const out = await stripeCollectionAdapter({ stripe }).createPaymentRequest({
    ...input,
    method: "cash",
  });
  assert.equal(out.ok, false);
  if (out.ok) return;
  assert.equal(out.reason, "cash_is_recorded");
  assert.equal(calls.length, 0);
});

test("terminal create is refused without keys or a reader", async () => {
  const { calls, stripe } = fakeStripe();
  const adapter = stripeCollectionAdapter({ stripe });
  const out = await adapter.createPaymentRequest({ ...input, method: "terminal" });
  assert.equal(out.ok, false);
  if (out.ok) return;
  assert.equal(out.reason, "terminal_unavailable");
  assert.equal(calls.length, 0);
  assert.equal(adapter.terminalAvailability().available, false);
});

test("Stripe Terminal code exists; keys and reader are separate from Point", () => {
  assert.equal(stripeTerminalSupported(), true);
  assert.deepEqual(reportStripeTerminalAvailability({ secretKey: null, readerId: null }), {
    available: false,
    reason: "stripe_terminal_missing_keys",
  });
  assert.deepEqual(reportStripeTerminalAvailability({ secretKey: "sk_test", readerId: null }), {
    available: false,
    reason: "stripe_terminal_missing_reader",
  });
  assert.equal(reportTerminalAvailability().available, false);
});

test("refund without a wired Stripe refund stays on the original route", async () => {
  const { stripe } = fakeStripe();
  const out = await stripeCollectionAdapter({ stripe }).refund("cs_1");
  assert.equal(out.ok, false);
  if (out.ok) return;
  assert.match(out.error, /original Stripe route/);
});

/**
 * ── ASKING THE PROVIDER WHAT HAPPENED ──────────────────────────────────────
 *
 * `retrieveState` returned `{ state: "unknown" }` from a stub, so a card
 * collection whose response was lost could never be reconciled by anything.
 * These cover the real lookup against a fake Stripe. WHAT THEY DO NOT PROVE:
 * that Stripe's own field values are what this maps. No provider keys are
 * configured, and a fake cannot be evidence about a provider.
 */

type SessionShape = {
  id: string;
  status?: string | null;
  payment_status?: string | null;
  amount_total?: number | null;
  currency?: string | null;
  payment_intent?: unknown;
};

function fakeStripeWithSession(session: SessionShape | Error) {
  const retrieved: string[] = [];
  const client = {
    checkout: {
      sessions: {
        create: async () => ({ id: "cs_1", url: "https://checkout.stripe.test/c/pay/cs_1" }),
        retrieve: async (id: string) => {
          retrieved.push(id);
          if (session instanceof Error) throw session;
          return session;
        },
      },
    },
  };
  return { retrieved, stripe: client as never };
}

test("a completed and paid session maps to succeeded and carries the charge reference", async () => {
  const { retrieved, stripe } = fakeStripeWithSession({
    id: "cs_live_1",
    status: "complete",
    payment_status: "paid",
    amount_total: 5000,
    currency: "usd",
    payment_intent: { id: "pi_live_1" },
  });
  const out = await stripeCollectionAdapter({ stripe }).retrieveState("cs_live_1");
  assert.deepEqual(retrieved, ["cs_live_1"]);
  assert.ok(!("ok" in out));
  if ("ok" in out) return;
  assert.equal(out.state, "succeeded");
  assert.equal(out.amountCents, 5000);
  assert.equal(out.currency, "USD");
  // Without this the recovery would complete an order it could never refund.
  assert.equal(out.paymentReference, "pi_live_1");
});

test("a payment_intent serialised as a bare id is still read", async () => {
  const { stripe } = fakeStripeWithSession({
    id: "cs_live_2",
    status: "complete",
    payment_status: "paid",
    amount_total: 100,
    currency: "usd",
    payment_intent: "pi_live_2",
  });
  const out = await stripeCollectionAdapter({ stripe }).retrieveState("cs_live_2");
  assert.ok(!("ok" in out));
  if ("ok" in out) return;
  assert.equal(out.paymentReference, "pi_live_2");
});

test("an expired session is cancelled; an open one is still pending, declined card or not", () => {
  // THE EXPENSIVE MISTAKE THIS PINS DOWN. A declined card leaves the session
  // OPEN — the buyer may try another card on the very same page. Calling that
  // `failed` would hand the balance back to the till while the customer is
  // still able to pay, which is the double take the whole mechanism closes.
  assert.equal(mapCheckoutSessionState({ status: "open", payment_status: "unpaid" }), "pending");
  assert.equal(mapCheckoutSessionState({ status: "expired", payment_status: "unpaid" }), "cancelled");
  assert.equal(mapCheckoutSessionState({ status: "complete", payment_status: "paid" }), "succeeded");
  assert.equal(
    mapCheckoutSessionState({ status: "complete", payment_status: "no_payment_required" }),
    "succeeded",
  );
  // An asynchronous method still clearing is not a failure.
  assert.equal(mapCheckoutSessionState({ status: "complete", payment_status: "unpaid" }), "pending");
  assert.equal(mapCheckoutSessionState({ status: null, payment_status: null }), "unknown");
});

test("a pending session reports no charge reference", async () => {
  const { stripe } = fakeStripeWithSession({
    id: "cs_open",
    status: "open",
    payment_status: "unpaid",
    amount_total: 5000,
    currency: "usd",
    payment_intent: { id: "pi_not_charged" },
  });
  const out = await stripeCollectionAdapter({ stripe }).retrieveState("cs_open");
  assert.ok(!("ok" in out));
  if ("ok" in out) return;
  assert.equal(out.state, "pending");
  assert.equal(out.paymentReference, null);
});

test("not being able to ask is a refusal, never an answer of unknown", async () => {
  // The distinction the whole recovery rests on: "the provider says nothing
  // happened" must not be reachable from "we could not reach the provider".
  const thrown = await stripeCollectionAdapter({
    stripe: fakeStripeWithSession(new Error("network")).stripe,
  }).retrieveState("cs_live_3");
  assert.equal("ok" in thrown && thrown.ok, false);

  const noKeys = await stripeCollectionAdapter({ stripe: null }).retrieveState("cs_live_3");
  assert.equal("ok" in noKeys && noKeys.ok, false);

  const mock = await stripeCollectionAdapter({ stripe: fakeStripeWithSession({ id: "x" }).stripe })
    .retrieveState("mock_txn_1");
  assert.equal("ok" in mock && mock.ok, false);
  if (!("ok" in mock)) return;
  assert.match(mock.error, /without Stripe configured/);
});

test("GUARD BITES: the stub answer is gone", async () => {
  // The stub returned `{ state: "unknown", amountCents: 0, currency: "USD" }`
  // for every id without asking anybody. If that comes back, this fake's
  // retrieve would never be called and the state would not be the session's.
  const { retrieved, stripe } = fakeStripeWithSession({
    id: "cs_probe",
    status: "complete",
    payment_status: "paid",
    amount_total: 1234,
    currency: "eur",
  });
  const out = await stripeCollectionAdapter({ stripe }).retrieveState("cs_probe");
  assert.equal(retrieved.length, 1, "the adapter answered without asking the provider");
  assert.ok(!("ok" in out));
  if ("ok" in out) return;
  assert.notEqual(out.state, "unknown");
  assert.equal(out.amountCents, 1234);
});
