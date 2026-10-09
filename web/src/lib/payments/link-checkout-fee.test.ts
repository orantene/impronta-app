/**
 * Payment-link checkout charges the Tulala service fee (PM ruling 2026-10-08):
 * the client pays the link's amount PLUS the pass_through surcharge
 * (`PASS_THROUGH_DEFAULT_TAKE_BPS` unless the platform row says otherwise),
 * resolved by the same path the purchase checkout uses, shown as its own
 * Checkout line, and settled against the fee-inclusive gross.
 *
 * Paid QA found the opposite: an accepted MX$1,000 offer's link charged
 * MXN 1,000.00 with platform_fee_cents 0 on the money row.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createPaymentLink } from "./links";
import { openPaymentLinkCheckout } from "./link-checkout";
import { paymentLinkFeeLines, resolvePaymentLinkCharge } from "./link-charge";
import type { PassThroughCollectAdmin } from "@/lib/orders/purchase-pass-through-collect";
import { checkoutLineItems, type CheckoutSessionInput } from "./stripe-checkout";
import { feeLineItemName } from "./line-item-name";
import { PASS_THROUGH_DEFAULT_TAKE_BPS, resolveBookingCommissions } from "@/lib/billing/commission";
import { settleCheckoutPayment } from "@/lib/stripe/webhook-card-settle";
import { fakeAdmin, makeStore, type Row } from "@/lib/pos/__fixtures__/pos-store";

const STRIPE_ENV = { STRIPE_SECRET_KEY: "sk_test_fixture" };
const SUCCESS = "https://qa.example/pay/CODE?status=paid";
const CANCEL = "https://qa.example/pay/CODE";
const ARM = "COMMISSION_PROCESSING_PASS_THROUGH";

type Platform = { take?: number | null; payer?: "seller" | "client"; mode?: string };

/** The pos fake plus the two platform RPCs the fee path reads. */
function withPlatform(store: ReturnType<typeof makeStore>, p: Platform, calls: string[] = []): PassThroughCollectAdmin {
  const base = fakeAdmin(store);
  return {
    from: base.from,
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push(fn);
      if (fn === "engine_platform_processing_mode") {
        return {
          data: {
            processing_mode: p.mode ?? "pass_through",
            pass_through_take_bps: p.take ?? null,
            processor_fee_rates: {
              default: { percent: 0.029, fixed_cents: 30, tax_on_fee: 0 },
              mxn: { percent: 0.036, fixed_cents: 300, tax_on_fee: 0.16 },
            },
          },
          error: null,
        };
      }
      if (fn === "engine_processing_fee_payer") return { data: p.payer ?? "seller", error: null };
      return base.rpc(fn, args);
    },
  } as unknown as PassThroughCollectAdmin;
}

async function withArm<T>(value: string | undefined, run: () => Promise<T>): Promise<T> {
  const before = process.env[ARM];
  if (value === undefined) delete process.env[ARM];
  else process.env[ARM] = value;
  try {
    return await run();
  } finally {
    if (before === undefined) delete process.env[ARM];
    else process.env[ARM] = before;
  }
}

function fakeStripe() {
  const created: CheckoutSessionInput[] = [];
  const url = "https://checkout.stripe.com/c/pay/cs_test_fee";
  return {
    created,
    deps: {
      createCheckoutSession: async (input: CheckoutSessionInput) => {
        created.push(input);
        return { ok: true as const, url, sessionId: "cs_test_fee" };
      },
      retrieveCheckoutSession: async () => ({ ok: true as const, status: "open", url }),
    },
  };
}

/** An accepted-offer order: one talent line, the whole total on one link. */
async function mintLink(currency: "MXN" | "USD", totalCents: number, p: Platform, calls?: string[]) {
  const store = makeStore();
  store.orders.push({ id: "o1", tenant_id: "t1", status: "pending_payment", currency, total_cents: totalCents, version: 1, inquiry_id: null, customer_id: null });
  store.order_lines.push({ id: "l1", order_id: "o1", tenant_id: "t1", label: "Gel manicure", units: 1, unit_cents: totalCents, total_cents: totalCents, talent_profile_id: "tp1", owner_tenant_id: null, talent_cost_cents: 0 });
  const admin = withPlatform(store, p, calls);
  const minted = await createPaymentLink(admin, {
    tenantId: "t1",
    orderId: "o1",
    amountCents: totalCents,
    idempotencyKey: `fee-${currency}-${totalCents}`,
    actorUserId: "0f3c6b7a-2d1e-4c5b-9a8f-7e6d5c4b3a21",
    publicOrigin: "https://qa.example",
    env: STRIPE_ENV,
  });
  if (!minted.ok) throw new Error(`mint failed: ${JSON.stringify(minted)}`);
  return { store, admin, code: minted.code };
}

async function openWithFee(currency: "MXN" | "USD", totalCents: number, p: Platform) {
  const ctx = await mintLink(currency, totalCents, p);
  const stripe = fakeStripe();
  const opened = await withArm("1", () =>
    openPaymentLinkCheckout(ctx.admin, { code: ctx.code, successUrl: SUCCESS, cancelUrl: CANCEL, locale: "en" }, stripe.deps),
  );
  assert.equal(opened.ok, true, JSON.stringify(opened));
  assert.equal(ctx.store.booking_transactions.length, 1);
  return { ...ctx, stripe, txn: ctx.store.booking_transactions[0] as Row };
}

function sessionLines(input: CheckoutSessionInput) {
  const items = checkoutLineItems(input);
  assert.ok(items, "the fee lines fit inside the charge");
  return items.map((i) => ({ name: i.price_data?.product_data?.name, cents: i.price_data?.unit_amount, currency: i.price_data?.currency }));
}

test("MXN 1,000 link: the client pays 1,015.00, the row carries the 15.00 fee, Checkout shows it as its own line", async () => {
  assert.equal(PASS_THROUGH_DEFAULT_TAKE_BPS, 150);
  const { txn, stripe } = await openWithFee("MXN", 100000, {});
  assert.equal(txn.gross_amount_cents, 101500);
  assert.equal(txn.platform_fee_cents, 1500);
  assert.equal(txn.net_amount_cents, 100000, "net is the principal the order is credited");
  assert.equal(txn.platform_fee_basis_points, 0, "pass-through shape: DB CHECK booking_transactions_fee_netted_no_order");
  assert.equal(txn.order_id, "o1");

  assert.equal(stripe.created.length, 1);
  const session = stripe.created[0];
  assert.equal(session.amountCents, 101500, "Stripe charges the gross the settle guard compares against");
  assert.deepEqual(sessionLines(session), [
    { name: "Gel manicure · full payment", cents: 100000, currency: "mxn" },
    { name: feeLineItemName("service", "en"), cents: 1500, currency: "mxn" },
  ]);
});

test("USD 100.00 link: 1.50 fee, 101.50 total", async () => {
  const { txn, stripe } = await openWithFee("USD", 10000, {});
  assert.equal(txn.gross_amount_cents, 10150);
  assert.equal(txn.platform_fee_cents, 150);
  assert.equal(txn.net_amount_cents, 10000);
  assert.equal(stripe.created[0].amountCents, 10150);
  assert.deepEqual(sessionLines(stripe.created[0]).map((l) => l.cents), [10000, 150]);
});

test("the platform row's take wins: 0 bps charges the bare amount with one Checkout line", async () => {
  const { txn, stripe } = await openWithFee("USD", 10000, { take: 0 });
  assert.equal(txn.gross_amount_cents, 10000);
  assert.equal(txn.platform_fee_cents, 0);
  assert.equal(stripe.created[0].amountCents, 10000);
  assert.equal(sessionLines(stripe.created[0]).length, 1);
});

test("a seller who passes the card fee on: service + card lines, all inside the charge", async () => {
  const { txn, stripe } = await openWithFee("USD", 10000, { payer: "client" });
  const lines = sessionLines(stripe.created[0]);
  assert.equal(lines.length, 3);
  assert.equal(lines[1].cents, 150, "the service fee stays 1.5%");
  assert.equal(lines[2].name, feeLineItemName("processing", "en"));
  const total = lines.reduce((s, l) => s + (l.cents ?? 0), 0);
  assert.equal(total, txn.gross_amount_cents);
  assert.equal(stripe.created[0].amountCents, txn.gross_amount_cents);
  assert.equal(txn.platform_fee_cents, Number(txn.gross_amount_cents) - 10000);
});

test("unarmed (env off) or included mode: no fee and, when off, no platform read at all", async () => {
  const calls: string[] = [];
  const ctx = await mintLink("USD", 10000, {}, calls);
  const stripe = fakeStripe();
  await withArm(undefined, () => openPaymentLinkCheckout(ctx.admin, { code: ctx.code, successUrl: SUCCESS, cancelUrl: CANCEL }, stripe.deps));
  assert.equal(ctx.store.booking_transactions[0].gross_amount_cents, 10000);
  assert.equal(ctx.store.booking_transactions[0].platform_fee_cents, 0);
  assert.ok(!calls.includes("engine_platform_processing_mode"));

  const included = await openWithFee("USD", 10000, { mode: "included" });
  assert.equal(included.txn.gross_amount_cents, 10000);
});

test("the row and the frozen pass_through snapshot agree, so refund and payout math read the same numbers", async () => {
  const { txn } = await openWithFee("MXN", 100000, {});
  const snap = resolveBookingCommissions({
    tenantId: "t1",
    workspacePlan: "free",
    offerLineItems: [{ line_total_cents: 100000, talent_cost_total_cents: 100000 }],
    currencyCode: "MXN",
    paymentMethod: "card",
    sellerOfRecord: "talent",
    platformConfig: { default_take_bps: 600, default_take_floor_cents: 0, plan_tier_bps: {}, processing_mode: "pass_through" },
    tenantOverride: null,
  });
  assert.equal(snap.gross_charged_cents, txn.gross_amount_cents);
  assert.equal(snap.client_surcharge_cents, txn.platform_fee_cents);
  assert.equal(snap.gross_cents, txn.net_amount_cents);
});

test("settlement: the fee-inclusive amount pays; a charge of only the subtotal is held as amount_mismatch", async () => {
  const { store, txn } = await openWithFee("MXN", 100000, {});
  const paid: string[] = [];
  const deps = {
    markPaid: async (id: string) => {
      paid.push(id);
      return { ok: true as const };
    },
    recordChargePlatform: async () => true,
    loadChargePlatformForTransaction: async () => "us" as const,
    getAdmin: () => fakeAdmin(store) as unknown as SupabaseClient,
  };
  const event = (amount: number) =>
    ({
      id: `evt_${amount}`,
      object: "event",
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_fee", object: "checkout.session", amount_total: amount, currency: "mxn" } },
    }) as unknown as Stripe.Event;
  const action = { transactionId: String(txn.id), paymentIntentId: "pi_test_fee" };

  assert.deepEqual(await settleCheckoutPayment(event(100000), action, "us", deps), { ok: true, outcome: "amount_mismatch" });
  assert.equal(paid.length, 0);
  assert.deepEqual(await settleCheckoutPayment(event(101500), action, "us", deps), { ok: true, outcome: "paid" });
  assert.deepEqual(paid, [txn.id]);
});

test("a bound draft whose amounts the fees no longer match is not resumed under the same session key", async () => {
  const ctx = await mintLink("MXN", 100000, {});
  const failing = {
    createCheckoutSession: async () => ({ ok: false as const, error: "boom", uncertain: true }),
  };
  await withArm(undefined, () => openPaymentLinkCheckout(ctx.admin, { code: ctx.code, successUrl: SUCCESS, cancelUrl: CANCEL }, failing));
  const draft = ctx.store.booking_transactions[0];
  assert.equal(draft.status, "draft");
  assert.equal(draft.gross_amount_cents, 100000);

  const stripe = fakeStripe();
  const opened = await withArm("1", () =>
    openPaymentLinkCheckout(ctx.admin, { code: ctx.code, successUrl: SUCCESS, cancelUrl: CANCEL }, stripe.deps),
  );
  assert.deepEqual(opened, { ok: false, reason: "unavailable" });
  assert.equal(stripe.created.length, 0);
});

test("the pay page breakdown is the charge's own lines; none without a fee", async () => {
  const store = makeStore();
  store.order_lines.push({ id: "l1", order_id: "o1", tenant_id: "t1", units: 1, total_cents: 100000, talent_profile_id: "tp1", owner_tenant_id: null, talent_cost_cents: 0 });
  const charge = await withArm("1", () =>
    resolvePaymentLinkCharge(withPlatform(store, {}), { tenantId: "t1", orderId: "o1", principalCents: 100000, currency: "MXN" }),
  );
  assert.ok(charge);
  assert.deepEqual(paymentLinkFeeLines(charge), [
    { code: "service_subtotal", cents: 100000 },
    { code: "platform_fee", cents: 1500 },
    { code: "total_charged", cents: 101500 },
  ]);
  assert.deepEqual(paymentLinkFeeLines({ principalCents: 100, chargeCents: 100, serviceFeeCents: 0, processingFeeCents: 0 }), []);
});

test("checkoutLineItems refuses fee lines that do not fit inside the charge", () => {
  const base = { amountCents: 1000, currency: "USD", description: "Service" };
  assert.equal(checkoutLineItems({ ...base, feeLines: [{ name: "Fee", amountCents: 1000 }] }), null);
  assert.equal(checkoutLineItems({ ...base, feeLines: [{ name: "Fee", amountCents: 1.5 }] }), null);
  assert.equal(checkoutLineItems({ ...base, feeLines: [{ name: "Fee", amountCents: -1 }] }), null);
  assert.equal(checkoutLineItems(base)?.length, 1);
});

test("static: the link insert no longer hard-codes a zero fee, and the pay page shows the charge", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/payments/link-checkout.ts"), "utf8");
  const insert = src.slice(src.indexOf('.from("booking_transactions")\n      .insert('), src.indexOf("requested_at:"));
  assert.ok(insert.length > 0);
  assert.doesNotMatch(insert, /platform_fee_cents:\s*0\b/);
  assert.doesNotMatch(insert, /gross_amount_cents:\s*amountCents\b/);
  assert.match(insert, /gross_amount_cents:\s*charge\.chargeCents/);
  // bps stays 0 ON PURPOSE: the row carries order_id, and a positive bps there
  // is the fee-netted shape the DB CHECK refuses (TUL-154).
  assert.match(insert, /platform_fee_basis_points:\s*0/);
  assert.match(src, /amountCents:\s*charge\.chargeCents/);

  const page = readFileSync(join(process.cwd(), "src/app/(public)/pay/[code]/pay-page.tsx"), "utf8");
  assert.match(page, /resolvePaymentLinkCharge\(/);
  assert.match(page, /amountCents=\{chargeCents\}/);
});
