/**
 * TUL-284: the transaction-keyed charge-currency guard, and the three Stripe
 * creators that run it (Checkout, embedded PaymentIntent, Terminal PaymentIntent).
 * Every public charge entry point (instant-book, ticket picker, storefront carts
 * and pickers, pay links) reaches Stripe through these creators.
 * Rule: charge currency == the priced thing's own currency, AND the seller's
 * Stripe lane supports it (US: USD; MX: MXN or USD). Fail closed on read failure.
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' node_modules/.bin/tsx --test src/lib/payments/seller-currency-guard.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createCheckoutSessionForTransaction } from "./stripe-checkout";
import { createPaymentIntentForTransaction } from "./stripe-payment-intent";
import { createStripeTerminalPaymentRequest } from "./stripe-terminal";
import { checkTransactionChargeCurrency, type ChargeCurrencyGuard } from "./seller-currency-guard";

type Table = "booking_transactions" | "orders" | "payout_accounts" | "talent_profiles" | "agencies";
type Rows = Partial<Record<Table, unknown>>;
type Fail = Partial<Record<Table, "error" | "thrown">>;

function fakeSb(rows: Rows, fail: Fail = {}): SupabaseClient {
  return {
    from: (table: Table) => {
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq"]) b[m] = () => b;
      b.maybeSingle = async () => {
        if (fail[table] === "thrown") throw new Error("boom");
        if (fail[table] === "error") return { data: null, error: { message: "db down" } };
        return { data: rows[table] ?? null, error: null };
      };
      return b;
    },
  } as unknown as SupabaseClient;
}

/** A talent-sold order: priced in `priced`, settled on `lane`. The talent's default_currency is irrelevant. */
const sale = (priced: string | null, lane: "us" | "mx", defaultCurrency = "MXN"): Rows => ({
  booking_transactions: { order_id: "ord1", source_tenant_id: "ten1", payout_receiver_id: "pa1" },
  orders: { currency: priced },
  payout_accounts: { owner_type: "talent", owner_id: "tp1" },
  talent_profiles: { stripe_account_platform: lane, default_currency: defaultCurrency },
});

const input = { transactionId: "txn_1", currency: "USD" };
const code = (r: { ok: boolean; code?: string }) => (r.ok ? "ok" : r.code);

describe("checkTransactionChargeCurrency", () => {
  it("refuses a missing client (fail closed)", async () => {
    assert.equal(code(await checkTransactionChargeCurrency(null, input)), "seller_currency_unreadable");
  });
  for (const table of ["booking_transactions", "orders", "payout_accounts", "talent_profiles"] as const) {
    for (const mode of ["error", "thrown"] as const) {
      it(`refuses when the ${table} read ${mode === "error" ? "errors" : "throws"}`, async () => {
        const r = await checkTransactionChargeCurrency(fakeSb(sale("USD", "us"), { [table]: mode }), input);
        assert.equal(code(r), "seller_currency_unreadable");
      });
    }
  }
  it("refuses when the workspace lane read errors", async () => {
    const sb = fakeSb({ booking_transactions: { order_id: null, source_tenant_id: "ten1", payout_receiver_id: null } }, { agencies: "error" });
    assert.equal(code(await checkTransactionChargeCurrency(sb, input)), "seller_currency_unreadable");
  });
  it("the 6-offering scenario: an MXN-default talent with a USD offering passes on the MX lane", async () => {
    assert.deepEqual(await checkTransactionChargeCurrency(fakeSb(sale("USD", "mx", "MXN")), input), { ok: true });
  });
  it("an MXN offering charged in MXN passes on the MX lane", async () => {
    assert.deepEqual(await checkTransactionChargeCurrency(fakeSb(sale("MXN", "mx")), { ...input, currency: "mxn" }), { ok: true });
  });
  it("a USD offering on the US lane passes", async () => {
    assert.deepEqual(await checkTransactionChargeCurrency(fakeSb(sale("USD", "us", "USD")), input), { ok: true });
  });
  it("an MXN charge on the US lane is refused (unsupported for the lane)", async () => {
    const r = await checkTransactionChargeCurrency(fakeSb(sale("MXN", "us")), { ...input, currency: "MXN" });
    assert.equal(code(r), "charge_currency_unsupported_for_lane");
  });
  it("a charge currency different from the priced thing's currency is refused", async () => {
    assert.equal(code(await checkTransactionChargeCurrency(fakeSb(sale("MXN", "mx")), input)), "charge_currency_not_priced_currency");
    assert.equal(
      code(await checkTransactionChargeCurrency(fakeSb(sale("USD", "mx")), { ...input, currency: "MXN" })),
      "charge_currency_not_priced_currency",
    );
  });
  it("a workspace seller (payout receiver agency, then source workspace) gets the same lane rule", async () => {
    const agency = (lane: "us" | "mx"): Rows => ({
      booking_transactions: { order_id: "ord1", source_tenant_id: "ten1", payout_receiver_id: "pa1" },
      orders: { currency: "MXN" },
      payout_accounts: { owner_type: "agency", owner_id: "ag1" },
      agencies: { stripe_account_platform: lane },
    });
    const mxn = { ...input, currency: "MXN" };
    assert.equal(code(await checkTransactionChargeCurrency(fakeSb(agency("us")), mxn)), "charge_currency_unsupported_for_lane");
    assert.equal(code(await checkTransactionChargeCurrency(fakeSb(agency("mx")), mxn)), "ok");
    const src: Rows = {
      booking_transactions: { order_id: null, source_tenant_id: "ten1", payout_receiver_id: null },
      agencies: { stripe_account_platform: "us" },
    };
    assert.equal(code(await checkTransactionChargeCurrency(fakeSb(src), mxn)), "charge_currency_unsupported_for_lane");
  });
  it("does NOT refuse a successful read that finds no transaction, order, seller or currency", async () => {
    assert.deepEqual(await checkTransactionChargeCurrency(fakeSb({}), input), { ok: true });
    const bare = { booking_transactions: { order_id: null, source_tenant_id: null, payout_receiver_id: null } };
    assert.deepEqual(await checkTransactionChargeCurrency(fakeSb(bare), input), { ok: true });
    assert.deepEqual(await checkTransactionChargeCurrency(fakeSb({ ...sale(null, "us"), orders: null }), input), { ok: true });
    assert.deepEqual(await checkTransactionChargeCurrency(fakeSb({ ...sale("USD", "us"), talent_profiles: null }), input), { ok: true });
  });
  it("refuses a charge with no valid currency", async () => {
    assert.equal(
      code(await checkTransactionChargeCurrency(fakeSb(sale("USD", "us")), { ...input, currency: "" })),
      "charge_currency_unsupported_for_lane",
    );
  });
});

function counters() {
  const calls = { sessions: 0, intents: 0, fetches: 0 };
  const stripe = {
    checkout: { sessions: { create: async () => { calls.sessions++; return { id: "cs_1", url: "https://c.test/cs_1" }; } } },
    paymentIntents: { create: async () => { calls.intents++; return { id: "pi_1", client_secret: "sec" }; } },
  };
  const fetchImpl = (async () => {
    calls.fetches++;
    return { ok: true, json: async () => ({ id: "pi_t", status: "requires_payment_method" }) };
  }) as unknown as typeof fetch;
  return { calls, stripe: stripe as never, fetchImpl };
}

const guardOver = (sb: SupabaseClient | null): ChargeCurrencyGuard => (_ignored, i) => checkTransactionChargeCurrency(sb, i);

const checkoutInput = {
  transactionId: "txn_1", amountCents: 85000, currency: "USD", payerEmail: null, inquiryId: null,
  bookingId: "b1", successUrl: "https://x.test/ok", cancelUrl: "https://x.test/no",
};
const piInput = { transactionId: "txn_1", amountCents: 85000, currency: "USD", payerEmail: null, inquiryId: "i1", bookingId: "b1" };
const termInput = { ...checkoutInput, method: "terminal" as const } as never;
const termEnv = { secretKey: "sk_test_1", readerId: "tmr_1" };

type Case = { name: string; run: (sb: SupabaseClient | null) => Promise<{ ok: boolean }>; calls: (c: ReturnType<typeof counters>["calls"]) => number };
let cur: ReturnType<typeof counters>;
function cases(): Case[] {
  return [
    {
      name: "Checkout session",
      run: (sb) => { const c = counters(); cur = c; return createCheckoutSessionForTransaction(checkoutInput, { stripe: c.stripe, currencyGuard: guardOver(sb) }); },
      calls: (c) => c.sessions,
    },
    {
      name: "embedded PaymentIntent",
      run: (sb) => {
        const c = counters();
        cur = c;
        process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_1";
        return createPaymentIntentForTransaction(piInput, { stripe: c.stripe, platform: "us", currencyGuard: guardOver(sb) });
      },
      calls: (c) => c.intents,
    },
    {
      name: "Terminal PaymentIntent",
      run: (sb) => { const c = counters(); cur = c; return createStripeTerminalPaymentRequest(termInput, termEnv, c.fetchImpl, guardOver(sb)); },
      calls: (c) => c.fetches,
    },
  ];
}

describe("the Stripe creators run the charge-currency guard before Stripe", () => {
  for (const c of cases()) {
    it(`${c.name}: a read error is refused before Stripe`, async () => {
      const r = await c.run(fakeSb(sale("USD", "us"), { orders: "error" }));
      assert.equal(r.ok, false);
      assert.equal(c.calls(cur.calls), 0);
    });
    it(`${c.name}: a missing service client is refused before Stripe`, async () => {
      assert.equal((await c.run(null)).ok, false);
      assert.equal(c.calls(cur.calls), 0);
    });
    it(`${c.name}: a charge currency different from the priced thing is refused before Stripe`, async () => {
      const r = await c.run(fakeSb(sale("MXN", "mx")));
      assert.equal(r.ok, false);
      assert.equal(c.calls(cur.calls), 0);
    });
    it(`${c.name}: a match reaches Stripe (USD offering on an MXN-default talent, MX lane)`, async () => {
      const r = await c.run(fakeSb(sale("USD", "mx", "MXN")));
      assert.equal(r.ok, true);
      assert.equal(c.calls(cur.calls), 1);
    });
  }
  it("production default: with nothing injected the guard runs (no service client in tests => refused, no Stripe)", async () => {
    const r = await createCheckoutSessionForTransaction(checkoutInput);
    assert.equal(r.ok, false);
  });
});
