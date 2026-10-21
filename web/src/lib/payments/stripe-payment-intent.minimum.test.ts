/**
 * TUL-1549 (P-10): the embedded Payment Element lane refuses a total under Stripe's minimum
 * with a sentence, never creates a free or doomed intent.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createPaymentIntentForTransaction } from "@/lib/payments/stripe-payment-intent";

function fake() {
  const calls: unknown[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stripe = { paymentIntents: { create: async (p: unknown) => { calls.push(p); return { id: "pi_1", client_secret: "sec" }; } } } as any;
  return { calls, stripe };
}
const base = { transactionId: "t1", currency: "MXN", payerEmail: null, inquiryId: "i1", bookingId: "b1" };

test("under the minimum: refused in ES/EN, nothing created", async () => {
  const { calls, stripe } = fake();
  const es = await createPaymentIntentForTransaction({ ...base, amountCents: 800, locale: "es" }, { stripe, platform: "us" });
  assert.equal(es.ok, false);
  if (!es.ok) assert.match(es.error, /mínimo de pago con tarjeta/);
  const unknown = await createPaymentIntentForTransaction({ ...base, amountCents: 800 }, { stripe, platform: "us" });
  if (!unknown.ok) assert.match(unknown.error, /under the card payment minimum.*mínimo de pago/);
  assert.equal(calls.length, 0);
});
