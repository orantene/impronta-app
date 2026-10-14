/**
 * TUL-703: a guest pays a MXN order whose transaction has NO payout receiver.
 * The seller of record is then the Profesional (the order line's talent), and an
 * MXN-default talent routes to the MX lane when STRIPE_MX_SECRET_KEY is set.
 * Without the key, today's refusal stays. A receiver always wins (unchanged).
 * Fakes only; no Stripe or DB call is made.
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' npx tsx --test src/lib/payments/mxn-guest-pay-lane.test.ts
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { checkTransactionChargeCurrency } from "./seller-currency-guard";
import { createCheckoutSessionForTransaction } from "./stripe-checkout";
import { resolveSellerPlatformForTransaction } from "@/lib/stripe/charge-platform";
import type { StripeAccountKey } from "@/lib/stripe/client";

type Rows = Record<string, unknown>;
type Fake = { sb: SupabaseClient; updates: Array<{ table: string; patch: unknown }> };

function fakeSb(rows: Rows): Fake {
  const updates: Fake["updates"] = [];
  const sb = {
    from: (table: string) => {
      let patch: unknown = null;
      const result = () => ({ data: rows[table] ?? null, error: null });
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => (patch ? Promise.resolve((updates.push({ table, patch }), { error: null })) : q);
      q.update = (p: unknown) => ((patch = p), q);
      q.maybeSingle = async () => result();
      q.then = (res: (v: unknown) => unknown) => res(result());
      return q;
    },
  } as unknown as SupabaseClient;
  return { sb, updates };
}

const MXN_ORDER_NO_RECEIVER = (over: Rows = {}): Rows => ({
  booking_transactions: { order_id: "ord1", source_tenant_id: "ten1", payout_receiver_id: null },
  orders: { currency: "MXN" },
  order_lines: [{ talent_profile_id: "tp1" }],
  talent_profiles: { default_currency: "MXN", stripe_account_id: null, stripe_account_platform: "us" },
  agencies: { stripe_account_platform: "us" },
  ...over,
});

const input = { transactionId: "txn1", currency: "MXN" };
let saved: string | undefined;
beforeEach(() => {
  saved = process.env.STRIPE_MX_SECRET_KEY;
  process.env.STRIPE_MX_SECRET_KEY = "sk_test_fake_mx";
});
afterEach(() => {
  if (saved === undefined) delete process.env.STRIPE_MX_SECRET_KEY;
  else process.env.STRIPE_MX_SECRET_KEY = saved;
});

describe("TUL-703 no-receiver MXN lane", () => {
  it("MX key set + MXN-default talent: lane resolves to mx", async () => {
    const r = await resolveSellerPlatformForTransaction("txn1", fakeSb(MXN_ORDER_NO_RECEIVER()).sb);
    assert.deepEqual(r, { ok: true, key: "mx" });
  });
  it("MX key set: the guard allows the MXN charge", async () => {
    assert.deepEqual(await checkTransactionChargeCurrency(fakeSb(MXN_ORDER_NO_RECEIVER()).sb, input), { ok: true });
  });
  it("MX key absent: today's refusal (lane us, MXN unsupported) and platform us", async () => {
    delete process.env.STRIPE_MX_SECRET_KEY;
    const r = await checkTransactionChargeCurrency(fakeSb(MXN_ORDER_NO_RECEIVER()).sb, input);
    assert.equal(r.ok ? "ok" : r.code, "charge_currency_unsupported_for_lane");
    assert.deepEqual(await resolveSellerPlatformForTransaction("txn1", fakeSb(MXN_ORDER_NO_RECEIVER()).sb), { ok: true, key: "us" });
  });
  it("USD-default talent stays on us", async () => {
    const rows = MXN_ORDER_NO_RECEIVER({ talent_profiles: { default_currency: "USD", stripe_account_id: null, stripe_account_platform: "us" } });
    assert.deepEqual(await resolveSellerPlatformForTransaction("txn1", fakeSb(rows).sb), { ok: true, key: "us" });
  });
  it("a talent already onboarded on the us platform is not moved to mx", async () => {
    const rows = MXN_ORDER_NO_RECEIVER({ talent_profiles: { default_currency: "MXN", stripe_account_id: "acct_1", stripe_account_platform: "us" } });
    assert.deepEqual(await resolveSellerPlatformForTransaction("txn1", fakeSb(rows).sb), { ok: true, key: "us" });
  });
  it("two different talents on the order is ambiguous: stays on the workspace lane", async () => {
    const rows = MXN_ORDER_NO_RECEIVER({ order_lines: [{ talent_profile_id: "tp1" }, { talent_profile_id: "tp2" }] });
    assert.deepEqual(await resolveSellerPlatformForTransaction("txn1", fakeSb(rows).sb), { ok: true, key: "us" });
  });
  it("a transaction WITH a receiver uses the receiver's lane (unchanged)", async () => {
    const rows = MXN_ORDER_NO_RECEIVER({
      booking_transactions: { order_id: "ord1", source_tenant_id: "ten1", payout_receiver_id: "pa1" },
      payout_accounts: { owner_type: "talent", owner_id: "tp1" },
      talent_profiles: { default_currency: "MXN", stripe_account_platform: "us" },
    });
    assert.deepEqual(await resolveSellerPlatformForTransaction("txn1", fakeSb(rows).sb), { ok: true, key: "us" });
    const g = await checkTransactionChargeCurrency(fakeSb(rows).sb, input);
    assert.equal(g.ok ? "ok" : g.code, "charge_currency_unsupported_for_lane");
  });
  it("Terminal (US key only) never infers mx from the talent: still refused", async () => {
    const r = await checkTransactionChargeCurrency(fakeSb(MXN_ORDER_NO_RECEIVER()).sb, input, { talentMxLane: false });
    assert.equal(r.ok ? "ok" : r.code, "charge_currency_unsupported_for_lane");
  });
  it("checkout is created on the MX platform and stamps stripe_platform=mx", async () => {
    const { sb, updates } = fakeSb(MXN_ORDER_NO_RECEIVER());
    const created: unknown[] = [];
    const requested: StripeAccountKey[] = [];
    const stripe = {
      checkout: { sessions: { create: async (p: unknown) => (created.push(p), { id: "cs_1", url: "https://x/pay" }) } },
    } as unknown as Stripe;
    const r = await createCheckoutSessionForTransaction(
      { transactionId: "txn1", amountCents: 1000, currency: "MXN", payerEmail: null, inquiryId: null, bookingId: "b", successUrl: "https://x/s", cancelUrl: "https://x/c" },
      { sb, stripeFor: (k) => (requested.push(k), stripe) },
    );
    assert.equal(r.ok, true);
    assert.deepEqual(requested, ["mx"]);
    assert.equal(created.length, 1);
    assert.deepEqual(updates, [{ table: "booking_transactions", patch: { stripe_platform: "mx" } }]);
  });
  it("checkout with the MX key absent refuses before any Stripe call", async () => {
    delete process.env.STRIPE_MX_SECRET_KEY;
    const { sb, updates } = fakeSb(MXN_ORDER_NO_RECEIVER());
    const requested: StripeAccountKey[] = [];
    const r = await createCheckoutSessionForTransaction(
      { transactionId: "txn1", amountCents: 1000, currency: "MXN", payerEmail: null, inquiryId: null, bookingId: "b", successUrl: "https://x/s", cancelUrl: "https://x/c" },
      { sb, stripeFor: (k) => (requested.push(k), null) },
    );
    assert.equal(r.ok, false);
    assert.deepEqual(requested, []);
    assert.deepEqual(updates, []);
  });
});
