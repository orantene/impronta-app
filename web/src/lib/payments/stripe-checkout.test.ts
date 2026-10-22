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
import { checkoutFailureIsUncertain, createCheckoutSessionForTransaction } from "@/lib/payments/stripe-checkout";

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

/**
 * A POS collection holds a claim on the order's outstanding balance, and that
 * claim is reaped on a timer. A session with no expiry lives about 24 hours,
 * so it outlived the claim by hours: the reaper freed the balance, a second
 * till collected it, and the first customer's page still worked. Both
 * payments landed on one order.
 */
test("a caller-named expiry is sent to Stripe as unix seconds", async () => {
  const { calls, stripe } = fakeStripe();
  const expiresAt = "2026-09-09T18:31:00.000Z";
  const out = await createCheckoutSessionForTransaction(input({ expiresAt }), { stripe });

  assert.equal(out.ok, true);
  assert.equal(calls[0].params.expires_at, Math.floor(Date.parse(expiresAt) / 1000));
});

test("no expiry named means the field is omitted, not sent null", async () => {
  const { calls, stripe } = fakeStripe();
  await createCheckoutSessionForTransaction(input(), { stripe });
  assert.equal("expires_at" in calls[0].params, false);

  const second = fakeStripe();
  await createCheckoutSessionForTransaction(input({ expiresAt: null }), { stripe: second.stripe });
  assert.equal("expires_at" in second.calls[0].params, false);
});

test("an unparseable expiry is dropped rather than failing a real payment", async () => {
  const { calls, stripe } = fakeStripe();
  const out = await createCheckoutSessionForTransaction(input({ expiresAt: "soon" }), { stripe });

  assert.equal(out.ok, true, "a malformed optional field must not sink the charge");
  assert.equal("expires_at" in calls[0].params, false);
});

test("payment_intent_data.metadata carries the same routing keys as the session", async () => {
  const { calls, stripe } = fakeStripe();
  await createCheckoutSessionForTransaction(input(), { stripe });

  const piMeta = (calls[0].params.payment_intent_data as { metadata: Record<string, string> }).metadata;
  assert.deepEqual(piMeta, {
    transaction_id: "txn_abc",
    inquiry_id: "inq_1",
    booking_id: "bk_1",
  });
});

test("a null inquiryId omits inquiry_id from payment_intent_data too", async () => {
  const { calls, stripe } = fakeStripe();
  await createCheckoutSessionForTransaction(input({ inquiryId: null }), { stripe });

  const piMeta = (calls[0].params.payment_intent_data as { metadata: Record<string, string> }).metadata;
  assert.equal(piMeta.transaction_id, "txn_abc");
  assert.equal(piMeta.booking_id, "bk_1");
  assert.equal("inquiry_id" in piMeta, false);
});

test("no payment_method_types is sent: Stripe's dashboard configuration decides (dynamic methods)", async () => {
  const { calls, stripe } = fakeStripe();
  await createCheckoutSessionForTransaction(input(), { stripe });
  assert.equal("payment_method_types" in calls[0].params, false);
});

test("F5: only a Stripe refusal is a definite failure; network/5xx/unknown are uncertain", () => {
  assert.equal(checkoutFailureIsUncertain({ type: "StripeInvalidRequestError" }), false);
  assert.equal(checkoutFailureIsUncertain({ type: "StripeCardError" }), false);
  assert.equal(checkoutFailureIsUncertain({ type: "StripeConnectionError" }), true);
  assert.equal(checkoutFailureIsUncertain({ type: "StripeAPIError" }), true);
  assert.equal(checkoutFailureIsUncertain(new Error("socket hang up")), true);
});

test("F5: a mock success URL that already has a query keeps it valid", async () => {
  const res = await createCheckoutSessionForTransaction(
    {
      transactionId: "t1",
      amountCents: 100,
      currency: "usd",
      payerEmail: null,
      inquiryId: null,
      bookingId: "b1",
      successUrl: "https://x.test/checkout/success?session_id={CHECKOUT_SESSION_ID}",
      cancelUrl: "https://x.test/c",
    },
    { stripe: null },
  );
  assert.ok(res.ok);
  if (res.ok) assert.match(res.url, /\?session_id=.*&mock=1&tx=t1$/);
});

function withEnv<T>(env: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const saved: Record<string, string | undefined> = {};
  const e = process.env as Record<string, string | undefined>;
  for (const k of Object.keys(env)) {
    saved[k] = e[k];
    if (env[k] === undefined) delete e[k];
    else e[k] = env[k];
  }
  return fn().finally(() => {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete e[k];
      else e[k] = saved[k];
    }
  });
}

const mockInput = {
  transactionId: "t1",
  amountCents: 100,
  currency: "usd",
  payerEmail: null,
  inquiryId: null,
  bookingId: "b1",
  successUrl: "https://x.test/ok",
  cancelUrl: "https://x.test/c",
};

test("TUL-141: production + no Stripe key fails instead of faking success", async () => {
  const res = await withEnv({ NODE_ENV: "production", PAYMENTS_MOCK: undefined }, () =>
    createCheckoutSessionForTransaction(mockInput, { stripe: null }),
  );
  assert.equal(res.ok, false);
});

test("TUL-141: production + PAYMENTS_MOCK=1 still mocks", async () => {
  const res = await withEnv({ NODE_ENV: "production", PAYMENTS_MOCK: "1" }, () =>
    createCheckoutSessionForTransaction(mockInput, { stripe: null }),
  );
  assert.ok(res.ok);
  if (res.ok) assert.equal(res.mock, true);
});

test("TUL-141: non-production + no Stripe key mocks (existing behavior)", async () => {
  const res = await withEnv({ NODE_ENV: "development", PAYMENTS_MOCK: undefined }, () =>
    createCheckoutSessionForTransaction(mockInput, { stripe: null }),
  );
  assert.ok(res.ok);
});

// ---- TUL-1549 (P-10): under Stripe's minimum is refused with a sentence, never free ----

test("a total under the Stripe minimum is refused before Stripe is called, in the payer's language", async () => {
  for (const [currency, amountCents, locale, text] of [
    ["MXN", 800, "es", /mínimo de pago con tarjeta/],
    ["MXN", 999, "en", /under the card payment minimum/],
    ["USD", 49, "en", /\$0\.50/],
  ] as const) {
    const { calls, stripe } = fakeStripe();
    const out = await createCheckoutSessionForTransaction(input({ currency, amountCents, locale }), { stripe });
    assert.equal(out.ok, false);
    if (!out.ok) {
      assert.match(out.error, text);
      assert.equal(out.uncertain, false);
    }
    assert.equal(calls.length, 0, "nothing reaches Stripe");
  }
});

test("exactly the minimum, and above it, still creates the session", async () => {
  for (const [currency, amountCents] of [["MXN", 1000], ["USD", 50], ["MXN", 12_345]] as const) {
    const { calls, stripe } = fakeStripe();
    const out = await createCheckoutSessionForTransaction(input({ currency, amountCents }), { stripe });
    assert.equal(out.ok, true);
    assert.equal(calls.length, 1);
  }
});

// ─── TUL-1865: country prefill ───────────────────────────────────────────────

/** MX charges are stamped on the transaction row before Stripe is called; stub that write and the seller guards. */
const mxDeps = {
  platform: "mx" as const,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: { from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }) } as any,
  currencyGuard: async () => ({ ok: true as const }),
  accountGuard: async () => ({ ok: true as const }),
};

function fakeStripeWithCustomers(opts: { customerFails?: boolean } = {}) {
  const base = fakeStripe();
  const customers: Array<{ params: Record<string, unknown>; options?: { idempotencyKey?: string } }> = [];
  const stripe = {
    ...base.stripe,
    customers: {
      create: async (params: Record<string, unknown>, options?: { idempotencyKey?: string }) => {
        if (opts.customerFails) throw new Error("boom");
        customers.push({ params, options });
        return { id: "cus_mx" };
      },
    },
  };
  return { calls: base.calls, customers, stripe };
}

test("an MX-platform charge pre-selects Mexico through a customer address and drops customer_email", async () => {
  const { calls, customers, stripe } = fakeStripeWithCustomers();
  const out = await createCheckoutSessionForTransaction(input({ currency: "MXN" }), { stripe, ...mxDeps });
  assert.equal(out.ok, true);
  assert.deepEqual(customers[0].params.address, { country: "MX" });
  assert.equal(customers[0].options?.idempotencyKey, "cust_txn_txn_abc");
  assert.equal(calls[0].params.customer, "cus_mx");
  assert.equal("customer_email" in calls[0].params && calls[0].params.customer_email !== undefined, false);
  assert.equal(calls[0].options?.idempotencyKey, "cs_txn_txn_abc");
});

test("an explicit payer country wins; a US-platform charge with no country keeps customer_email", async () => {
  const a = fakeStripeWithCustomers();
  await createCheckoutSessionForTransaction(input({ payerCountry: "co" }), { stripe: a.stripe, platform: "us" });
  assert.deepEqual(a.customers[0].params.address, { country: "CO" });

  const b = fakeStripeWithCustomers();
  await createCheckoutSessionForTransaction(input(), { stripe: b.stripe, platform: "us" });
  assert.equal(b.customers.length, 0);
  assert.equal(b.calls[0].params.customer_email, "client@example.com");
  assert.equal(b.calls[0].params.customer, undefined);
});

test("a failed customer create never blocks payment: the session falls back to customer_email", async () => {
  const { calls, stripe } = fakeStripeWithCustomers({ customerFails: true });
  const out = await createCheckoutSessionForTransaction(input({ currency: "MXN" }), { stripe, ...mxDeps });
  assert.equal(out.ok, true);
  assert.equal(calls[0].params.customer_email, "client@example.com");
  assert.equal(calls[0].params.customer, undefined);
});
