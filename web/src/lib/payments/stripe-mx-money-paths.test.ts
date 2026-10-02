/**
 * Stripe Mexico money-path routing: charge, payout hold, release guard.
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' tsx --test <this file>
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decideLegPlatform, normalizeStripePlatform } from "@/lib/stripe/account-routing";
import { executeBookingTransfers } from "@/lib/payments/transfers";
import { createPaymentIntentForTransaction } from "@/lib/payments/stripe-payment-intent";
import { createCheckoutSessionForTransaction } from "@/lib/payments/stripe-checkout";

test("decideLegPlatform: same platform transfers on it; mismatch holds", () => {
  assert.deepEqual(decideLegPlatform({ chargePlatform: "us", recipientPlatform: "us" }), { ok: true, key: "us" });
  assert.deepEqual(decideLegPlatform({ chargePlatform: "mx", recipientPlatform: "mx" }), { ok: true, key: "mx" });
  assert.equal(decideLegPlatform({ chargePlatform: "us", recipientPlatform: "mx" }).ok, false);
  assert.equal(decideLegPlatform({ chargePlatform: "mx", recipientPlatform: "us" }).ok, false);
});

test("decideLegPlatform: global payouts is US-platform only", () => {
  assert.equal(decideLegPlatform({ chargePlatform: "mx", recipientPlatform: "mx", rail: "global_payouts" }).ok, false);
  assert.equal(decideLegPlatform({ chargePlatform: "us", recipientPlatform: "us", rail: "global_payouts" }).ok, true);
});

test("normalizeStripePlatform defaults to us", () => {
  assert.equal(normalizeStripePlatform(undefined), "us");
  assert.equal(normalizeStripePlatform("mx"), "mx");
  assert.equal(normalizeStripePlatform("xx"), "us");
});

// ── executeBookingTransfers ────────────────────────────────────────────────
function makeSb(): SupabaseClient {
  const txn = { id: "t1", booking_id: "b1", status: "paid", currency: "usd" };
  const snap = {
    booking_id: "b1",
    participant_id: "p1",
    owning_party_type: "talent",
    owning_party_id: "tal1",
    talent_net_cents: 5000,
    workspace_fee_cents: 0,
    platform_fee_cents: 500,
    gross_charged_cents: 5500,
    currency_code: "usd",
  };
  const make = (table: string) => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      insert: () => Promise.resolve({ data: null, error: null }),
      update: () => chain,
      order: () =>
        Promise.resolve(table === "booking_commission_snapshot" ? { data: [snap], error: null } : { data: [], error: null }),
      maybeSingle: () =>
        Promise.resolve(
          table === "booking_transactions" ? { data: txn, error: null } : { data: null, error: null },
        ),
    };
    return chain;
  };
  return { from: (t: string) => make(t) } as unknown as SupabaseClient;
}

function fakeStripe() {
  const calls: unknown[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stripe = { transfers: { create: async (p: unknown) => (calls.push(p), { id: "tr_1" }) } } as any;
  return { calls, stripe };
}

test("transfers: MX charge to a US-platform talent is HELD, no transfer", async () => {
  const { calls, stripe } = fakeStripe();
  const out = await executeBookingTransfers("t1", {
    sb: makeSb(),
    stripe,
    chargePlatform: "mx",
    resolveRecipientPlatform: async () => "us",
    resolveTalentAccount: async () => "acct_us",
    resolvePayoutRail: () => "connect_transfer",
  });
  assert.equal(calls.length, 0);
  assert.equal(out[0]?.status, "skipped_cross_platform");
});

test("transfers: US charge to an MX-platform talent is HELD, no transfer", async () => {
  const { calls, stripe } = fakeStripe();
  const out = await executeBookingTransfers("t1", {
    sb: makeSb(),
    stripe,
    chargePlatform: "us",
    resolveRecipientPlatform: async () => "mx",
    resolveTalentAccount: async () => "acct_mx",
    resolvePayoutRail: () => "connect_transfer",
  });
  assert.equal(calls.length, 0);
  assert.equal(out[0]?.status, "skipped_cross_platform");
});

test("transfers: MX charge to an MX talent transfers on the injected (MX) client", async () => {
  const prev = process.env.STRIPE_ALLOW_LIVE_PAYOUTS;
  process.env.STRIPE_ALLOW_LIVE_PAYOUTS = "true";
  try {
    const { calls, stripe } = fakeStripe();
    const out = await executeBookingTransfers("t1", {
      sb: makeSb(),
      stripe,
      chargePlatform: "mx",
      resolveRecipientPlatform: async () => "mx",
      resolveTalentAccount: async () => "acct_mx",
      resolvePayoutRail: () => "connect_transfer",
    });
    assert.equal(calls.length, 1);
    assert.equal(out[0]?.status, "transferred");
  } finally {
    if (prev === undefined) delete process.env.STRIPE_ALLOW_LIVE_PAYOUTS;
    else process.env.STRIPE_ALLOW_LIVE_PAYOUTS = prev;
  }
});

// ── checkout / payment intent ───────────────────────────────────────────────
test("payment intent: MX seller never mocks when MX keys are missing", async () => {
  const prevSk = process.env.STRIPE_MX_SECRET_KEY;
  const prevPk1 = process.env.NEXT_PUBLIC_STRIPE_MX_PUBLISHABLE_KEY;
  const prevPk2 = process.env.STRIPE_MX_PUBLISHABLE_KEY;
  delete process.env.STRIPE_MX_SECRET_KEY;
  delete process.env.NEXT_PUBLIC_STRIPE_MX_PUBLISHABLE_KEY;
  delete process.env.STRIPE_MX_PUBLISHABLE_KEY;
  try {
    const r = await createPaymentIntentForTransaction(
      { transactionId: "t1", amountCents: 1000, currency: "MXN", payerEmail: null, inquiryId: "i", bookingId: "b" },
      { platform: "mx" },
    );
    assert.equal(r.ok, false);
  } finally {
    if (prevSk !== undefined) process.env.STRIPE_MX_SECRET_KEY = prevSk;
    if (prevPk1 !== undefined) process.env.NEXT_PUBLIC_STRIPE_MX_PUBLISHABLE_KEY = prevPk1;
    if (prevPk2 !== undefined) process.env.STRIPE_MX_PUBLISHABLE_KEY = prevPk2;
  }
});

test("payment intent: US default keeps mock mode without keys", async () => {
  const r = await createPaymentIntentForTransaction(
    { transactionId: "t1", amountCents: 1000, currency: "USD", payerEmail: null, inquiryId: "i", bookingId: "b" },
    { platform: "us", stripe: null },
  );
  assert.equal(r.ok && r.mock, true);
});

test("hosted checkout: MX charge fails closed when the platform cannot be recorded", async () => {
  const created: unknown[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stripe = { checkout: { sessions: { create: async (p: unknown) => (created.push(p), { id: "cs_1", url: "u" }) } } } as any;
  const r = await createCheckoutSessionForTransaction(
    {
      transactionId: "t1",
      amountCents: 1000,
      currency: "MXN",
      payerEmail: null,
      inquiryId: null,
      bookingId: "b",
      successUrl: "https://x/s",
      cancelUrl: "https://x/c",
    },
    { stripe, platform: "mx" },
  );
  // No service-role DB in the test env: the MX marker cannot be written, so no session is created.
  assert.equal(r.ok, false);
  assert.equal(created.length, 0);
});
