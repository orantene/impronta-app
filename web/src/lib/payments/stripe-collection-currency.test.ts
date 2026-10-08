/**
 * TUL-274: request-payment charges on an inquiry are refused before Stripe when
 * the currency does not match the single seller, and FAIL CLOSED when the
 * seller cannot be read. Uses the real guard over a fake supabase.
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' node_modules/.bin/tsx --test src/lib/payments/stripe-collection-currency.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkInquiryCurrencyMatchesSeller } from "@/lib/inquiry/offer-currency-seller";
import { stripeCollectionAdapter } from "./stripe-collection";

function fakeStripe() {
  const calls: unknown[] = [];
  const client = {
    checkout: {
      sessions: {
        create: async (params: unknown) => {
          calls.push(params);
          return { id: "cs_1", url: "https://checkout.stripe.test/c/pay/cs_1" };
        },
      },
    },
  };
  return { calls, stripe: client as never };
}

type Mode = "ok" | "read_error" | "thrown";
function fakeSb(currencies: string[], mode: Mode = "ok"): SupabaseClient {
  const builder = (rows: unknown[]) => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in"]) b[m] = () => b;
    b.then = (resolve: (v: { data: unknown; error: unknown }) => unknown) => {
      if (mode === "thrown") throw new Error("boom");
      return resolve(mode === "read_error" ? { data: null, error: { message: "db down" } } : { data: rows, error: null });
    };
    return b;
  };
  return {
    from: (table: string) =>
      table === "inquiry_participants"
        ? builder(currencies.map((_, i) => ({ talent_profile_id: `t${i}` })))
        : builder(currencies.map((c, i) => ({ id: `t${i}`, default_currency: c, stripe_account_platform: "us" }))),
  } as unknown as SupabaseClient;
}

const base = {
  transactionId: "txn_1",
  amountCents: 85000,
  payerEmail: null,
  inquiryId: "inq_1",
  bookingId: "bk_1",
  successUrl: "https://app.test/ok",
  cancelUrl: "https://app.test/no",
  method: "online_card" as const,
};

function adapter(sb: SupabaseClient) {
  const { calls, stripe } = fakeStripe();
  return {
    calls,
    a: stripeCollectionAdapter({
      stripe,
      currencyGuard: (_client, input) => checkInquiryCurrencyMatchesSeller(sb, input),
    }),
  };
}

test("seller read error -> refused before Stripe (fail closed)", async () => {
  for (const mode of ["read_error", "thrown"] as const) {
    const { a, calls } = adapter(fakeSb(["MXN"], mode));
    const out = await a.createPaymentRequest({ ...base, currency: "MXN" });
    assert.equal(out.ok, false);
    assert.equal(calls.length, 0);
  }
});

test("currency mismatch -> refused before Stripe", async () => {
  const { a, calls } = adapter(fakeSb(["MXN"]));
  const out = await a.createPaymentRequest({ ...base, currency: "USD" });
  assert.equal(out.ok, false);
  if (!out.ok) assert.match(out.error, /offer is in USD but the seller charges in MXN/);
  assert.equal(calls.length, 0);
});

test("matching currency passes to Stripe", async () => {
  const { a, calls } = adapter(fakeSb(["MXN"]));
  const out = await a.createPaymentRequest({ ...base, currency: "MXN" });
  assert.equal(out.ok, true);
  assert.equal(calls.length, 1);
});

test("mixed sellers are unchanged (not refused)", async () => {
  const { a, calls } = adapter(fakeSb(["MXN", "USD"]));
  const out = await a.createPaymentRequest({ ...base, currency: "USD" });
  assert.equal(out.ok, true);
  assert.equal(calls.length, 1);
});

test("a charge with no inquiry (POS walk-in) is not guarded", async () => {
  const { a, calls } = adapter(fakeSb(["MXN"], "read_error"));
  const out = await a.createPaymentRequest({ ...base, inquiryId: null, currency: "USD" });
  assert.equal(out.ok, true);
  assert.equal(calls.length, 1);
});
