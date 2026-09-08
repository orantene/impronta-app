import { test } from "node:test";
import assert from "node:assert/strict";
import { stripeCollectionAdapter } from "./stripe-collection";
import { reportTerminalAvailability, stripeTerminalSupported } from "./terminal-availability";

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

test("terminal create is refused until Point lands", async () => {
  const { calls, stripe } = fakeStripe();
  const adapter = stripeCollectionAdapter({ stripe });
  const out = await adapter.createPaymentRequest({ ...input, method: "terminal" });
  assert.equal(out.ok, false);
  if (out.ok) return;
  assert.equal(out.reason, "terminal_unavailable");
  assert.equal(calls.length, 0);
  assert.deepEqual(adapter.terminalAvailability(), { available: false, reason: "point_not_landed" });
});

test("pilot terminal report is unavailable", () => {
  assert.deepEqual(reportTerminalAvailability(), { available: false, reason: "point_not_landed" });
  assert.equal(stripeTerminalSupported(), false);
});

test("refund without a wired Stripe refund stays on the original route", async () => {
  const { stripe } = fakeStripe();
  const out = await stripeCollectionAdapter({ stripe }).refund("cs_1");
  assert.equal(out.ok, false);
  if (out.ok) return;
  assert.match(out.error, /original Stripe route/);
});
