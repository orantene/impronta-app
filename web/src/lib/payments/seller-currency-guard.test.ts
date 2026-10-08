/**
 * TUL-284: the transaction-keyed seller-currency guard, and the three Stripe
 * creators that run it (Checkout, embedded PaymentIntent, Terminal PaymentIntent).
 * Every public charge entry point (instant-book, ticket picker, storefront carts
 * and pickers, pay links) reaches Stripe through these creators.
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' node_modules/.bin/tsx --test src/lib/payments/seller-currency-guard.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createCheckoutSessionForTransaction } from "./stripe-checkout";
import { createPaymentIntentForTransaction } from "./stripe-payment-intent";
import { createStripeTerminalPaymentRequest } from "./stripe-terminal";
import { checkTransactionChargeCurrency, type ChargeCurrencyGuard } from "./seller-currency-guard";

type Rows = Partial<Record<"booking_transactions" | "payout_accounts" | "talent_profiles" | "agencies", unknown>>;
type Fail = Partial<Record<"booking_transactions" | "payout_accounts" | "talent_profiles" | "agencies", "error" | "thrown">>;

function fakeSb(rows: Rows, fail: Fail = {}): SupabaseClient {
  return {
    from: (table: keyof Rows) => {
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

const talentSeller = (cur: string | null): Rows => ({
  booking_transactions: { source_tenant_id: "ten1", payout_receiver_id: "pa1" },
  payout_accounts: { owner_type: "talent", owner_id: "tp1" },
  talent_profiles: { default_currency: cur },
});

const input = { transactionId: "txn_1", currency: "USD" };

describe("checkTransactionChargeCurrency", () => {
  it("refuses a missing client (fail closed)", async () => {
    const r = await checkTransactionChargeCurrency(null, input);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "seller_currency_unreadable");
  });
  for (const table of ["booking_transactions", "payout_accounts", "talent_profiles"] as const) {
    for (const mode of ["error", "thrown"] as const) {
      it(`refuses when the ${table} read ${mode === "error" ? "errors" : "throws"}`, async () => {
        const r = await checkTransactionChargeCurrency(fakeSb(talentSeller("MXN"), { [table]: mode }), input);
        assert.equal(r.ok, false);
        if (!r.ok) assert.equal(r.code, "seller_currency_unreadable");
      });
    }
  }
  it("refuses when the workspace read errors", async () => {
    const sb = fakeSb({ booking_transactions: { source_tenant_id: "ten1", payout_receiver_id: null } }, { agencies: "error" });
    const r = await checkTransactionChargeCurrency(sb, input);
    assert.equal(r.ok, false);
  });
  it("refuses a talent seller in MXN charged in USD", async () => {
    const r = await checkTransactionChargeCurrency(fakeSb(talentSeller("MXN")), input);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "offer_currency_seller_mismatch");
  });
  it("refuses a workspace seller (payout receiver agency) on mismatch", async () => {
    const sb = fakeSb({
      booking_transactions: { source_tenant_id: "ten1", payout_receiver_id: "pa1" },
      payout_accounts: { owner_type: "agency", owner_id: "ag1" },
      agencies: { default_currency: "MXN" },
    });
    assert.equal((await checkTransactionChargeCurrency(sb, input)).ok, false);
  });
  it("refuses the source workspace on mismatch when there is no payout receiver", async () => {
    const sb = fakeSb({ booking_transactions: { source_tenant_id: "ten1", payout_receiver_id: null }, agencies: { default_currency: "MXN" } });
    assert.equal((await checkTransactionChargeCurrency(sb, input)).ok, false);
  });
  it("passes on a match (case-insensitive)", async () => {
    assert.deepEqual(await checkTransactionChargeCurrency(fakeSb(talentSeller("usd")), input), { ok: true });
  });
  it("does NOT refuse a successful read with no transaction, no seller or an unknown currency", async () => {
    assert.deepEqual(await checkTransactionChargeCurrency(fakeSb({}), input), { ok: true });
    assert.deepEqual(
      await checkTransactionChargeCurrency(fakeSb({ booking_transactions: { source_tenant_id: null, payout_receiver_id: null } }), input),
      { ok: true },
    );
    assert.deepEqual(await checkTransactionChargeCurrency(fakeSb(talentSeller(null)), input), { ok: true });
    assert.deepEqual(await checkTransactionChargeCurrency(fakeSb(talentSeller("???")), input), { ok: true });
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
function cases(): Case[] {
  return [
    {
      name: "Checkout session",
      run: (sb) => { const c = counters(); cur = c; return createCheckoutSessionForTransaction(checkoutInput, { stripe: c.stripe, currencyGuard: guardOver(sb) }); },
      calls: (c) => c.sessions,
    },
    {
      name: "embedded PaymentIntent",
      run: (sb) => { const c = counters(); cur = c; process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_1"; return createPaymentIntentForTransaction(piInput, { stripe: c.stripe, platform: "us", currencyGuard: guardOver(sb) }); },
      calls: (c) => c.intents,
    },
    {
      name: "Terminal PaymentIntent",
      run: (sb) => { const c = counters(); cur = c; return createStripeTerminalPaymentRequest(termInput, termEnv, c.fetchImpl, guardOver(sb)); },
      calls: (c) => c.fetches,
    },
  ];
}
let cur: ReturnType<typeof counters>;

describe("the Stripe creators run the seller-currency guard before Stripe", () => {
  for (const c of cases()) {
    it(`${c.name}: a seller read error is refused before Stripe`, async () => {
      const r = await c.run(fakeSb(talentSeller("USD"), { talent_profiles: "error" }));
      assert.equal(r.ok, false);
      assert.equal(c.calls(cur.calls), 0);
    });
    it(`${c.name}: a missing service client is refused before Stripe`, async () => {
      assert.equal((await c.run(null)).ok, false);
      assert.equal(c.calls(cur.calls), 0);
    });
    it(`${c.name}: a currency mismatch is refused before Stripe`, async () => {
      const r = await c.run(fakeSb(talentSeller("MXN")));
      assert.equal(r.ok, false);
      assert.equal(c.calls(cur.calls), 0);
    });
    it(`${c.name}: a match reaches Stripe`, async () => {
      const r = await c.run(fakeSb(talentSeller("USD")));
      assert.equal(r.ok, true);
      assert.equal(c.calls(cur.calls), 1);
    });
  }
  it("production default: with nothing injected the guard runs (no service client in tests => refused, no Stripe)", async () => {
    // No stripe / platform injected: the real guard runs with createServiceRoleClient(),
    // which is null without env. Fail closed.
    const r = await createCheckoutSessionForTransaction(checkoutInput);
    assert.equal(r.ok, false);
  });
});
