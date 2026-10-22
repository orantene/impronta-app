/**
 * TUL-1407: a paid seat (session_picker order: no payout receiver, no talent order line) in a talent-owned workspace
 * charges on the OWNING talent's Stripe platform instead of the workspace default 'us'. Multi-owner workspaces and
 * USD talents are unchanged. Fakes only; no Stripe or DB call is made.
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' npx tsx --test src/lib/payments/talent-workspace-seller-lane.test.ts
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { checkTransactionChargeCurrency } from "./seller-currency-guard";
import { createCheckoutSessionForTransaction } from "./stripe-checkout";
import { resolveSellerPlatformForTransaction } from "@/lib/stripe/charge-platform";
import { resolveNoReceiverTalentLane } from "@/lib/stripe/no-receiver-lane";
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
      for (const m of ["select", "is", "in", "limit"]) q[m] = () => q;
      q.eq = () => (patch ? Promise.resolve((updates.push({ table, patch }), { error: null })) : q);
      q.update = (p: unknown) => ((patch = p), q);
      q.maybeSingle = async () => result();
      q.then = (res: (v: unknown) => unknown) => res(result());
      return q;
    },
  } as unknown as SupabaseClient;
  return { sb, updates };
}

/** A seat order in a talent workspace: no receiver, no order lines; one active owner whose person profile is MXN/mx. */
const SEAT = (over: Rows = {}): Rows => ({
  booking_transactions: { order_id: "ord1", source_tenant_id: "ten1", payout_receiver_id: null },
  orders: { currency: "MXN" },
  order_lines: [],
  agencies: { workspace_type: "talent", stripe_account_platform: "us" },
  agency_memberships: [{ profile_id: "u1" }],
  talent_profiles: { id: "tp1", default_currency: "MXN", stripe_account_id: null, stripe_account_platform: "mx" },
  ...over,
});

const input = { transactionId: "txn1", currency: "MXN" };
const code = (r: { ok: boolean; code?: string }) => (r.ok ? "ok" : r.code);
let saved: string | undefined;
beforeEach(() => {
  saved = process.env.STRIPE_MX_SECRET_KEY;
  process.env.STRIPE_MX_SECRET_KEY = "sk_test_fake_mx";
});
afterEach(() => {
  if (saved === undefined) delete process.env.STRIPE_MX_SECRET_KEY;
  else process.env.STRIPE_MX_SECRET_KEY = saved;
});

describe("TUL-1407 talent-owned workspace seller lane", () => {
  it("(1) MXN paid seat passes the guard, resolves the mx platform and reaches checkout creation", async () => {
    assert.equal(code(await checkTransactionChargeCurrency(fakeSb(SEAT()).sb, input)), "ok");
    assert.deepEqual(await resolveSellerPlatformForTransaction("txn1", fakeSb(SEAT()).sb), { ok: true, key: "mx" });
    const { sb, updates } = fakeSb(SEAT());
    const created: unknown[] = [];
    const requested: StripeAccountKey[] = [];
    const stripe = {
      checkout: { sessions: { create: async (p: unknown) => (created.push(p), { id: "cs_1", url: "https://x/pay" }) } },
    } as unknown as Stripe;
    const r = await createCheckoutSessionForTransaction(
      { transactionId: "txn1", amountCents: 20000, currency: "MXN", payerEmail: null, inquiryId: null, bookingId: "b", successUrl: "https://x/s", cancelUrl: "https://x/c" },
      { sb, stripeFor: (k) => (requested.push(k), stripe) },
    );
    assert.equal(r.ok, true);
    assert.deepEqual(requested, ["mx"]);
    assert.equal(created.length, 1);
    assert.deepEqual(updates, [{ table: "booking_transactions", patch: { stripe_platform: "mx" } }]);
  });

  it("(2) a USD talent is unchanged: workspace lane us, MXN still refused, USD passes", async () => {
    const usd = SEAT({ talent_profiles: { id: "tp1", default_currency: "USD", stripe_account_id: null, stripe_account_platform: "us" } });
    assert.deepEqual(await resolveSellerPlatformForTransaction("txn1", fakeSb(usd).sb), { ok: true, key: "us" });
    assert.equal(code(await checkTransactionChargeCurrency(fakeSb(usd).sb, input)), "charge_currency_unsupported_for_lane");
    assert.equal(
      code(await checkTransactionChargeCurrency(fakeSb({ ...usd, orders: { currency: "USD" } }).sb, { ...input, currency: "USD" })),
      "ok",
    );
  });

  it("(3) a multi-owner workspace keeps the current refusal", async () => {
    const multi = SEAT({ agency_memberships: [{ profile_id: "u1" }, { profile_id: "u2" }] });
    assert.equal(code(await checkTransactionChargeCurrency(fakeSb(multi).sb, input)), "charge_currency_unsupported_for_lane");
    assert.deepEqual(await resolveSellerPlatformForTransaction("txn1", fakeSb(multi).sb), { ok: true, key: "us" });
  });

  it("a non-talent workspace (agency) keeps the current refusal", async () => {
    const agency = SEAT({ agencies: { workspace_type: "agency", stripe_account_platform: "us" } });
    assert.equal(code(await checkTransactionChargeCurrency(fakeSb(agency).sb, input)), "charge_currency_unsupported_for_lane");
  });

  it("MX key absent: today's refusal stays", async () => {
    delete process.env.STRIPE_MX_SECRET_KEY;
    assert.equal(code(await checkTransactionChargeCurrency(fakeSb(SEAT()).sb, input)), "charge_currency_unsupported_for_lane");
  });

  it("an owner already onboarded on the us platform is not moved to mx", async () => {
    const connected = SEAT({ talent_profiles: { id: "tp1", default_currency: "MXN", stripe_account_id: "acct_1", stripe_account_platform: "us" } });
    assert.deepEqual(await resolveSellerPlatformForTransaction("txn1", fakeSb(connected).sb), { ok: true, key: "us" });
  });

  it("omission case: no tenantId passed means no owner inference (not applicable), and a read error fails closed", async () => {
    assert.deepEqual(await resolveNoReceiverTalentLane(fakeSb(SEAT()).sb, "ord1"), { ok: true, lane: null });
    const failing = {
      from: () => {
        const q: Record<string, unknown> = {};
        for (const m of ["select", "eq", "is", "in", "limit"]) q[m] = () => q;
        q.maybeSingle = async () => ({ data: null, error: { message: "down" } });
        q.then = (res: (v: unknown) => unknown) => res({ data: null, error: { message: "down" } });
        return q;
      },
    } as unknown as SupabaseClient;
    assert.deepEqual(await resolveNoReceiverTalentLane(failing, "ord1", { tenantId: "ten1" }), { ok: false });
  });
});
