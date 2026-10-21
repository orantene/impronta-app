/** TUL-1609: a percentage-of-sales rent is charged automatically, one closed month at a time, never twice. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import type Stripe from "stripe";
import { addPercentToDraft } from "./rent-autopay.server";
import { buildRentSubscriptionParams, decideRentAutopay, percentMonthForInvoice, percentRentLines, previousPeriod, rentAutopayAmounts, transferPercentForFeeBps } from "./rent-autopay";
import { classifyRentSubscriptionEvent } from "./rent-autopay-routing";
import type { RentPlan } from "./rent-cycle";

const ev = (type: string, object: Record<string, unknown>) => ({ type, data: { object } }) as unknown as Stripe.Event;
const md = { checkout_type: "rent_subscription", rent_plan_id: "plan-1", tenant_id: "t-1", rent_cents: "0", fee_bps: "150" };
const DEC1 = Date.UTC(2026, 11, 1) / 1000;

describe("the percentage part", () => {
  test("percentage half-up of the closed month's sales, the same Tulala fee rate on top", () => {
    assert.deepEqual(percentRentLines({ salesBaseCents: 1_000_005, percentBps: 1_000, feeBps: 150 }), { percentCents: 100_001, feeCents: 1_500 });
    assert.deepEqual(percentRentLines({ salesBaseCents: 0, percentBps: 1_000, feeBps: 150 }), { percentCents: 0, feeCents: 0 });
  });
  test("no usable sales base: nothing is added (the webhook retries)", () => {
    for (const salesBaseCents of [null, -1, 1.5]) assert.equal(percentRentLines({ salesBaseCents, percentBps: 1_000, feeBps: 150 }), null);
  });
  test("the studio's share of any invoice is the same 1 / (1 + fee), rounded down, so a percentage line transfers correctly too", () => {
    assert.equal(transferPercentForFeeBps(150), 98.52);
    assert.equal(transferPercentForFeeBps(0), 100);
    const total = 100_001 + 1_500;
    assert.ok(Math.floor((total * transferPercentForFeeBps(150)) / 100) <= 100_001);
    assert.equal(rentAutopayAmounts(0, 150)?.transferPercent, 98.52, "a percentage-only plan still has a transfer share");
  });
});

describe("which month is billed on which invoice", () => {
  test("the invoice of December adds November's percentage", () => {
    assert.equal(previousPeriod("2026-12"), "2026-11");
    assert.equal(previousPeriod("2027-01"), "2026-12");
    assert.equal(percentMonthForInvoice({ invoicePeriod: "2026-12", autopayFirstPeriod: "2026-11" }), "2026-11");
  });
  test("the first automatic invoice adds no percentage: the start month is on its payment link", () => {
    assert.equal(percentMonthForInvoice({ invoicePeriod: "2026-11", autopayFirstPeriod: "2026-11" }), null);
    assert.equal(percentMonthForInvoice({ invoicePeriod: "2026-11", autopayFirstPeriod: null }), null);
  });
});

describe("events", () => {
  test("only a monthly renewal DRAFT is a chance to add the percentage", () => {
    const base = { id: "in_1", status: "draft", billing_reason: "subscription_cycle", customer: "cus_1", currency: "mxn", period_start: DEC1, parent: { subscription_details: { subscription: "sub_1", metadata: md } } };
    assert.deepEqual(classifyRentSubscriptionEvent(ev("invoice.created", base)), { type: "draft", planId: "plan-1", tenantId: "t-1", subscriptionId: "sub_1", invoiceId: "in_1", customerId: "cus_1", periodStart: DEC1, currency: "mxn", percentAdded: false, feeBps: 150 });
    assert.equal(classifyRentSubscriptionEvent(ev("invoice.created", { ...base, billing_reason: "subscription_create" })), null);
    // TUL-1717: an invoice created already past its draft window is not a chance to add the percentage; it is reported as past_draft
    assert.equal(classifyRentSubscriptionEvent(ev("invoice.created", { ...base, status: "open" }))?.type, "past_draft");
    const done = classifyRentSubscriptionEvent(ev("invoice.created", { ...base, metadata: { rent_percent_cents: "0" } }));
    assert.equal(done?.type === "draft" && done.percentAdded, true, "already stamped: a replay adds nothing");
  });
  test("the paid month records the fixed part plus the percentage added to that invoice", () => {
    const r = classifyRentSubscriptionEvent(ev("invoice.paid", { id: "in_1", amount_paid: 101_501, currency: "mxn", period_start: DEC1, metadata: { rent_percent_cents: "100001" }, parent: { subscription_details: { subscription: "sub_1", metadata: { ...md, rent_cents: "0" } } } }));
    assert.equal(r?.type === "paid" && r.rentCents, 100_001);
  });
});

describe("consent and wiring", () => {
  const plan = { id: "plan-1", tenantId: "t-1", talentProfileId: "tp-1", monthlyRentCents: 50_000, percentBps: 1_000, currency: "MXN", startsOn: "2026-09-01", status: "active", acceptedAt: "x", acceptedAmountCents: 50_000, acceptedPercentBps: 1_000, acceptedCurrency: "MXN", termsVersion: 1, acceptedTermsVersion: 1 } as RentPlan;
  test("the Subscribe text says a percentage of sales is charged each month, in the member's language", () => {
    const p = buildRentSubscriptionParams({ plan, amounts: rentAutopayAmounts(50_000, 150)!, feeBps: 150, customerId: "c", studioAccountId: "a", successUrl: "s", cancelUrl: "c", locale: "es", anchorSeconds: 1, rentLabel: "r", feeLabel: "f", consent: { custom_text: { submit: { message: "Tu plan se renueva." } } } });
    assert.match((p.custom_text?.submit && typeof p.custom_text.submit === "object" ? p.custom_text.submit.message : ""), /^Además, cada mes se cobra el 10% de tus ventas del mes anterior en este estudio, más el cargo por servicio de Tulala\. Tu plan se renueva\.$/);
    assert.equal(p.metadata?.fee_bps, "150");
  });
  test("the draft handler stamps the invoice, keys every item by invoice, and checks the ACCEPTED percentage", () => {
    const server = readFileSync(join(process.cwd(), "src/lib/service-hub/rent/rent-autopay.server.ts"), "utf8");
    assert.match(server, /idempotencyKey: `rent_pct_\$\{ev\.invoiceId\}`/);
    assert.match(server, /idempotencyKey: `rent_pct_fee_\$\{ev\.invoiceId\}`/);
    assert.match(server, /metadata: \{ rent_percent_cents: String\(lines\.percentCents\), rent_percent_month: month \}/);
    assert.match(server, /plan\.accepted_percent_bps !== percentBps/);
    const handler = readFileSync(join(process.cwd(), "src/lib/stripe/webhook-handler.ts"), "utf8");
    assert.match(handler, /if \(rent\.type === "draft"\)/);
  });
});

describe("TUL-1609 consultant fixes", () => {
  const pplan = { id: "plan-1", tenantId: "t-1", talentProfileId: "tp-1", monthlyRentCents: 50_000, percentBps: 1_000, currency: "MXN", startsOn: "2026-09-01", status: "active", acceptedAt: "x", acceptedAmountCents: 50_000, acceptedPercentBps: 1_000, acceptedCurrency: "MXN", termsVersion: 1, acceptedTermsVersion: 1 } as RentPlan;
  const studio = { accountId: "acct_1", chargesEnabled: true };
  test("a percentage plan cannot start automatic charging while RENT_AUTOPAY_PERCENT_ENABLED is off (fixed-only plans are unaffected)", () => {
    assert.deepEqual(decideRentAutopay({ plan: pplan, studio, feeBps: 150, autopayStatus: "off", percentEnabled: false }), { ok: false, reason: "percent_unavailable" });
    assert.deepEqual(decideRentAutopay({ plan: pplan, studio, feeBps: 150, autopayStatus: "off", percentEnabled: true }), { ok: true });
    const fixedOnly = { ...pplan, percentBps: 0, acceptedPercentBps: 0 } as RentPlan;
    assert.deepEqual(decideRentAutopay({ plan: fixedOnly, studio, feeBps: 150, autopayStatus: "off", percentEnabled: false }), { ok: true });
  });
  test("a failed percentage-only charge records what was owed, never 0 (amount_cents > 0)", () => {
    const failed = classifyRentSubscriptionEvent(ev("invoice.payment_failed", { id: "in_1", amount_due: 101_501, currency: "mxn", period_start: DEC1, metadata: { rent_percent_cents: "100001" }, parent: { subscription_details: { subscription: "sub_1", metadata: md } } }));
    assert.equal(failed?.type === "failed" && failed.rentCents, 100_001);
    const noStamp = classifyRentSubscriptionEvent(ev("invoice.payment_failed", { id: "in_2", amount_due: 5_000, currency: "mxn", period_start: DEC1, parent: { subscription_details: { subscription: "sub_1", metadata: md } } }));
    assert.equal(noStamp?.type === "failed" && noStamp.rentCents, 5_000);
  });

  const prev = process.env.RENT_AUTOPAY_PERCENT_ENABLED;
  beforeEach(() => { process.env.RENT_AUTOPAY_PERCENT_ENABLED = "1"; });
  afterEach(() => { if (prev === undefined) delete process.env.RENT_AUTOPAY_PERCENT_ENABLED; else process.env.RENT_AUTOPAY_PERCENT_ENABLED = prev; });
  const draft = { type: "draft", planId: "plan-1", tenantId: "t-1", subscriptionId: "sub_1", invoiceId: "in_1", customerId: "cus_1", periodStart: DEC1, currency: "mxn", percentAdded: false, feeBps: 150 } as const;
  const planRow = { stripe_subscription_id: "sub_1", rent_percent_bps: 1_000, accepted_percent_bps: 1_000, currency: "MXN", talent_profile_id: "tp-1", autopay_first_period: "2026-11" };
  function fake(invoice: Record<string, unknown>) {
    const q: Record<string, unknown> = {};
    Object.assign(q, { select: () => q, eq: () => q, update: () => q, maybeSingle: async () => ({ data: { ...planRow, autopay_percent_missed: [] }, error: null }), then: (res: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(res) });
    const created: string[] = [];
    const stripe = { invoices: { retrieve: async () => invoice, update: async () => ({}) }, invoiceItems: { create: async () => { created.push("item"); return {}; } } } as never;
    const rpc = async () => ({ data: "marked", error: null });
    return { admin: { from: () => q, rpc } as never, stripe, created };
  }
  test("flag off: nothing is added", async () => {
    delete process.env.RENT_AUTOPAY_PERCENT_ENABLED;
    const f = fake({ status: "draft", metadata: {} });
    assert.equal(await addPercentToDraft(f.admin, f.stripe, draft), "skipped");
    assert.deepEqual(f.created, []);
  });
  test("the LIVE invoice is re-read: no longer a draft, or already stamped, adds nothing", async () => {
    for (const live of [{ status: "open", metadata: {} }, { status: "draft", metadata: { rent_percent_cents: "0" } }]) {
      const f = fake(live);
      assert.equal(await addPercentToDraft(f.admin, f.stripe, draft), "skipped");
      assert.deepEqual(f.created, []);
    }
  });
});
