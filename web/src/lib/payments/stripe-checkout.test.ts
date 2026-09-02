/**
 * createCheckoutSessionForTransaction — the idempotency contract (no network).
 *
 * Hosted Checkout used to call `sessions.create(params)` with no options
 * argument, so a double-tapped Pay button or a retried server action minted
 * TWO Checkout sessions against one `booking_transactions` row and a client
 * who opened both could be charged twice for one invoice. The embedded
 * Payment Element lane (`stripe-payment-intent.ts`) had a key from the start;
 * this asserts the hosted lane matches it, at the same grain.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createCheckoutSessionForTransaction } from "@/lib/payments/stripe-checkout";

type Call = { params: Record<string, unknown>; options?: { idempotencyKey?: string } };

function fakeStripe(url: string | null = "https://checkout.stripe.test/c/pay/cs_1") {
  const calls: Call[] = [];
  const client = {
    checkout: {
      sessions: {
        create: async (
          params: Record<string, unknown>,
          options?: { idempotencyKey?: string },
        ) => {
          calls.push({ params, options });
          return { id: `cs_${calls.length}`, url };
        },
      },
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { calls, stripe: client as any };
}

function input(over: Partial<Parameters<typeof createCheckoutSessionForTransaction>[0]> = {}) {
  return {
    transactionId: "txn_abc",
    amountCents: 12500,
    currency: "USD",
    payerEmail: "client@example.com",
    inquiryId: "inq_1",
    bookingId: "bk_1",
    successUrl: "https://app.test/ok",
    cancelUrl: "https://app.test/no",
    ...over,
  };
}

test("passes an idempotency key keyed on the transaction id", async () => {
  const { calls, stripe } = fakeStripe();
  const out = await createCheckoutSessionForTransaction(input(), { stripe });

  assert.equal(out.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options?.idempotencyKey, "cs_txn_txn_abc");
});

test("two calls for the SAME transaction send the same key", async () => {
  const { calls, stripe } = fakeStripe();
  await createCheckoutSessionForTransaction(input(), { stripe });
  await createCheckoutSessionForTransaction(input(), { stripe });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].options?.idempotencyKey, calls[1].options?.idempotencyKey);
});

test("a deposit and its balance are different rows, so different keys", async () => {
  const { calls, stripe } = fakeStripe();
  await createCheckoutSessionForTransaction(input({ transactionId: "txn_deposit" }), { stripe });
  await createCheckoutSessionForTransaction(input({ transactionId: "txn_balance" }), { stripe });

  assert.notEqual(calls[0].options?.idempotencyKey, calls[1].options?.idempotencyKey);
  assert.equal(calls[0].options?.idempotencyKey, "cs_txn_txn_deposit");
  assert.equal(calls[1].options?.idempotencyKey, "cs_txn_txn_balance");
});

test("the charge still lands on the platform account (no stripeAccount option)", async () => {
  const { calls, stripe } = fakeStripe();
  await createCheckoutSessionForTransaction(input(), { stripe });

  // The Direct Charge branch was removed in the finance P0-3 pass. Adding an
  // idempotency key must not reintroduce a per-account option alongside it.
  assert.equal((calls[0].options as Record<string, unknown> | undefined)?.stripeAccount, undefined);
  assert.equal(calls[0].params.client_reference_id, "txn_abc");
});

test("a non-positive amount is refused before Stripe is called", async () => {
  const { calls, stripe } = fakeStripe();
  const out = await createCheckoutSessionForTransaction(input({ amountCents: 0 }), { stripe });

  assert.equal(out.ok, false);
  assert.equal(calls.length, 0);
});

test("no Stripe client → mock URL, and no key is invented", async () => {
  const out = await createCheckoutSessionForTransaction(input(), { stripe: null });

  assert.equal(out.ok, true);
  assert.equal(out.ok && out.mock, true);
});
