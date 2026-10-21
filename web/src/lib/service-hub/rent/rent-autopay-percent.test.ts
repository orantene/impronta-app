/** TUL-1609: a percentage-of-sales rent is charged automatically, one closed month at a time, never twice. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import type Stripe from "stripe";
import { buildRentSubscriptionParams, percentMonthForInvoice, percentRentLines, previousPeriod, rentAutopayAmounts, transferPercentForFeeBps } from "./rent-autopay";
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
    assert.equal(classifyRentSubscriptionEvent(ev("invoice.created", { ...base, status: "open" })), null);
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
    assert.match(p.custom_text?.submit?.message ?? "", /^Además, cada mes se cobra el 10% de tus ventas del mes anterior en este estudio, más el cargo por servicio de Tulala\. Tu plan se renueva\.$/);
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
