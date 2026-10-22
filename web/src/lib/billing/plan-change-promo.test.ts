import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";

import { buildBreakdown, renewalAmount } from "./plan-change-breakdown";
import { confirmPlanChange, previewPlanChange, type PlanChangePromoInput, type PlanChangeRequest, type PlanChangeStripe } from "./plan-change";
import { resolvePlanChangePromoWith, type PlanChangePromoReaders } from "./plan-change-promo";
import type { PricingDiscountRow } from "@/lib/pricing/pricing-types";

function discount(over: Partial<PricingDiscountRow> = {}): PricingDiscountRow {
  return {
    id: "d1",
    code: "HOLIDAY20",
    name: "Holiday",
    kind: "percent",
    value: 20,
    currency: null,
    appliesTo: "all",
    appliesFamily: null,
    duration: "repeating",
    durationMonths: 3,
    maxRedemptions: null,
    redemptionCount: 0,
    perCustomerLimit: 0,
    startsAt: null,
    endsAt: null,
    firstTimeOnly: false,
    minimumAmountCents: null,
    minimumAmountCurrency: null,
    campaign: null,
    source: "admin",
    stripeCouponId: "co_1",
    stripePromotionCodeId: "promo_1",
    isActive: true,
    ...over,
  };
}

function readers(over: Partial<PlanChangePromoReaders> & { row?: PricingDiscountRow | null; reason?: string } = {}): PlanChangePromoReaders {
  return {
    validate: over.validate ?? (async () => (over.row === null ? { ok: false as const, reason: over.reason ?? "Code not found." } : { ok: true as const, discount: over.row ?? discount() })),
    targetTierId: over.targetTierId ?? (async () => "tier_max"),
    priorRedemptions: over.priorRedemptions ?? (async () => 0),
  };
}

test("a code unknown to the catalog (created only in Stripe) is refused as invalid", async () => {
  const out = await resolvePlanChangePromoWith(readers({ row: null }), "talent", "QATEST20");
  assert.deepEqual(out, { ok: false, promoError: "invalid" });
});

test("expired / inactive / capped codes read as expired", async () => {
  for (const reason of ["Code has expired.", "Code is no longer active.", "Code has reached its redemption limit."]) {
    const out = await resolvePlanChangePromoWith(readers({ row: null, reason }), "talent", "X");
    assert.deepEqual(out, { ok: false, promoError: "expired" });
  }
});

test("family, tier, first-time and per-customer rules", async () => {
  assert.deepEqual(await resolvePlanChangePromoWith(readers({ row: discount({ appliesFamily: "workspace" }) }), "talent", "X"), { ok: false, promoError: "not_applicable" });
  assert.deepEqual(await resolvePlanChangePromoWith(readers({ row: discount({ appliesTo: ["tier_other"] }) }), "talent", "X"), { ok: false, promoError: "not_applicable" });
  assert.deepEqual(await resolvePlanChangePromoWith(readers({ targetTierId: async () => null }), "talent", "X"), { ok: false, promoError: "not_applicable" });
  assert.deepEqual(await resolvePlanChangePromoWith(readers({ row: discount({ firstTimeOnly: true }) }), "talent", "X"), { ok: false, promoError: "first_time_only" });
  const limited = readers({ row: discount({ perCustomerLimit: 1 }), priorRedemptions: async () => 1 });
  assert.deepEqual(await resolvePlanChangePromoWith(limited, "talent", "X"), { ok: false, promoError: "limit_reached" });
  assert.equal((await resolvePlanChangePromoWith(readers({ row: discount({ appliesTo: ["tier_max"], appliesFamily: "talent" }) }), "talent", "X")).ok, true);
});

test("promotion code is preferred; coupon is the fallback; a stub row is refused", async () => {
  const a = await resolvePlanChangePromoWith(readers(), "talent", " holiday20 ");
  assert.ok(a.ok);
  assert.deepEqual(a.promo.entry, { promotion_code: "promo_1" });
  const b = await resolvePlanChangePromoWith(readers({ row: discount({ stripePromotionCodeId: null }) }), "talent", "X");
  assert.ok(b.ok);
  assert.deepEqual(b.promo.entry, { coupon: "co_1" });
  const c = await resolvePlanChangePromoWith(readers({ row: discount({ stripePromotionCodeId: null, stripeCouponId: null }) }), "talent", "X");
  assert.deepEqual(c, { ok: false, promoError: "not_applicable" });
  assert.deepEqual(await resolvePlanChangePromoWith(readers(), "talent", "   "), { ok: false, promoError: "invalid" });
});

test("breakdown: credit, charge, discount, total, renewal", () => {
  const b = buildBreakdown(
    { amount_due: 800, currency: "usd", lines: { data: [{ amount: -300 }, { amount: 1500 }] }, total_discount_amounts: [{ amount: 400 }] },
    1200,
  );
  assert.deepEqual(b, { credit: 300, charge: 1500, discount: 400, total: 800, renewal: 1200 });
  assert.deepEqual(buildBreakdown({ amount_due: 0, currency: "usd" }, null), { credit: 0, charge: 0, discount: 0, total: 0, renewal: null });
});

test("renewal: once-codes are spent today, repeating codes keep applying, fixed codes never cross currency", () => {
  assert.equal(renewalAmount(1500, "usd", null), 1500);
  assert.equal(renewalAmount(1500, "usd", discount({ duration: "once", durationMonths: null })), 1500);
  assert.equal(renewalAmount(1500, "usd", discount()), 1200);
  assert.equal(renewalAmount(1500, "usd", discount({ kind: "free_months", value: 2 })), 0);
  assert.equal(renewalAmount(1500, "mxn", discount({ kind: "fixed", value: 5, currency: "USD", duration: "forever", durationMonths: null })), 1500);
  assert.equal(renewalAmount(null, "usd", discount()), null);
});

// ─── Stripe orchestration ───────────────────────────────────────────────────

type Call = { method: string; args: unknown[] };
const NOW = 1_800_000_000_000;

function sub(over: { discounts?: unknown[] } = {}): Stripe.Subscription {
  return {
    id: "sub_1",
    status: "active",
    trial_end: null,
    customer: "cus_1",
    schedule: null,
    discounts: over.discounts ?? [],
    metadata: { plan_key: "talent_pro", talent_profile_id: "tp_1" },
    items: { data: [{ id: "si_1", current_period_start: 1_000, current_period_end: 2_000_000_000, price: { id: "price_cur", currency: "usd", recurring: { interval: "month" } } }] },
  } as unknown as Stripe.Subscription;
}

function stripeFake(s: Stripe.Subscription, calls: Call[], opts: { previewError?: unknown } = {}): PlanChangeStripe {
  const rec = (method: string, ret: unknown, err?: unknown) => async (...args: unknown[]) => {
    calls.push({ method, args });
    if (err) throw err;
    return ret;
  };
  return {
    subscriptions: { retrieve: rec("subscriptions.retrieve", s), update: rec("subscriptions.update", s) },
    invoices: {
      createPreview: rec(
        "invoices.createPreview",
        { amount_due: 800, currency: "usd", lines: { data: [{ amount: -300 }, { amount: 1500 }] }, total_discount_amounts: [{ amount: 400 }] },
        opts.previewError,
      ),
    },
    prices: { retrieve: rec("prices.retrieve", { unit_amount: 1500, currency: "usd" }) },
    subscriptionSchedules: { create: rec("s.create", {}), update: rec("s.update", {}), release: rec("s.release", {}), retrieve: rec("s.retrieve", {}) },
  } as unknown as PlanChangeStripe;
}

const promo: PlanChangePromoInput = { entry: { promotion_code: "promo_1" }, discount: discount() };
const req = (over: Partial<PlanChangeRequest> = {}): PlanChangeRequest => ({
  kind: "talent",
  subjectId: "tp_1",
  subscriptionId: "sub_1",
  toPlan: "talent_portfolio",
  toInterval: "month",
  toPriceId: "price_new",
  ...over,
});

test("preview with a code sends discounts to Stripe and returns line items + the discounted renewal", async () => {
  const calls: Call[] = [];
  const out = await previewPlanChange(stripeFake(sub(), calls), req({ promo }), NOW);
  assert.ok(out.ok);
  const params = calls.find((c) => c.method === "invoices.createPreview")?.args[0] as { discounts?: unknown };
  assert.deepEqual(params.discounts, [{ promotion_code: "promo_1" }]);
  assert.equal(out.amountDueToday, 800);
  assert.deepEqual(out.breakdown, { credit: 300, charge: 1500, discount: 400, total: 800, renewal: 1200 });
  assert.equal(out.promo?.code, "HOLIDAY20");
  assert.equal(out.promo?.label.es, "20% de descuento por 3 meses");
});

test("preview without a code carries no discounts key and still returns line items", async () => {
  const calls: Call[] = [];
  const out = await previewPlanChange(stripeFake(sub(), calls), req(), NOW);
  assert.ok(out.ok);
  const params = calls.find((c) => c.method === "invoices.createPreview")?.args[0] as Record<string, unknown>;
  assert.equal("discounts" in params, false);
  assert.equal(out.breakdown?.renewal, 1500);
  assert.equal(out.promo, null);
});

test("a plan that already carries a discount refuses a second code before any Stripe preview", async () => {
  const calls: Call[] = [];
  const out = await previewPlanChange(stripeFake(sub({ discounts: ["di_1"] }), calls), req({ promo }), NOW);
  assert.ok(!out.ok);
  assert.equal(out.code, "promo");
  assert.equal(out.promoError, "already_discounted");
  assert.equal(calls.some((c) => c.method === "invoices.createPreview"), false);
});

test("a code on a scheduled downgrade is refused", async () => {
  const calls: Call[] = [];
  const downSub = { ...sub(), metadata: { plan_key: "talent_portfolio", talent_profile_id: "tp_1" } } as unknown as Stripe.Subscription;
  const out = await previewPlanChange(stripeFake(downSub, calls), req({ toPlan: "talent_pro", promo }), NOW);
  assert.ok(!out.ok);
  assert.equal(out.promoError, "upgrade_now_only");
});

test("Stripe refusing the code reads as a code problem, an outage does not", async () => {
  const refused = await previewPlanChange(
    stripeFake(sub(), [], { previewError: Object.assign(new Error("x"), { type: "StripeInvalidRequestError" }) }),
    req({ promo }),
    NOW,
  );
  assert.ok(!refused.ok);
  assert.equal(refused.code, "promo");
  const outage = await previewPlanChange(
    stripeFake(sub(), [], { previewError: Object.assign(new Error("x"), { type: "StripeConnectionError" }) }),
    req({ promo }),
    NOW,
  );
  assert.ok(!outage.ok);
  assert.equal(outage.code, "stripe");
});

test("confirm applies the code on the one existing subscription, keyed by the code, never a second subscription", async () => {
  const calls: Call[] = [];
  const s = stripeFake(sub(), calls);
  const p = await previewPlanChange(s, req({ promo }), NOW);
  assert.ok(p.ok);
  const c = await confirmPlanChange(s, req({ promo }), p.prorationDate, NOW + 1000);
  assert.ok(c.ok);
  const update = calls.find((x) => x.method === "subscriptions.update");
  assert.ok(update);
  const [id, params, opts] = update.args as [string, { discounts?: unknown; proration_behavior: string }, { idempotencyKey: string }];
  assert.equal(id, "sub_1");
  assert.deepEqual(params.discounts, [{ promotion_code: "promo_1" }]);
  assert.equal(params.proration_behavior, "always_invoice");
  assert.match(opts.idempotencyKey, /_promo_1$/);
  assert.equal(calls.filter((x) => x.method === "subscriptions.update").length, 1);
});

test("confirm without a code leaves the update params and key exactly as before", async () => {
  const calls: Call[] = [];
  const s = stripeFake(sub(), calls);
  const p = await previewPlanChange(s, req(), NOW);
  assert.ok(p.ok);
  await confirmPlanChange(s, req(), p.prorationDate, NOW + 1000);
  const update = calls.find((x) => x.method === "subscriptions.update");
  const [, params, opts] = update!.args as [string, Record<string, unknown>, { idempotencyKey: string }];
  assert.equal("discounts" in params, false);
  assert.doesNotMatch(opts.idempotencyKey, /promo/);
});
