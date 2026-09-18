import assert from "node:assert/strict";
import { test } from "node:test";

import {
  amountOptions,
  canMintPaymentLink,
  cancelTargetsFrom,
  defaultCancelTarget,
  defaultPaymentTarget,
  depositFor,
  dollarsToCents,
  footerLabelKindFor,
  fullAmountCentsFor,
  openRequestFor,
  partialAmountValid,
  paymentTargetsFrom,
  refundOptions,
  selectAcceptedOffer,
  type OfferDepositRule,
} from "./payment-view";

const OFFER_PCT: OfferDepositRule = { status: "accepted", depositPct: 30, depositAmountCents: null, totalClientPrice: 1000 };
const OFFER_CENTS: OfferDepositRule = { status: "accepted", depositPct: null, depositAmountCents: 15000, totalClientPrice: 1000 };
const OFFER_NONE: OfferDepositRule = { status: "accepted", depositPct: null, depositAmountCents: null, totalClientPrice: 1000 };

test("selectAcceptedOffer: the first accepted row, or null with none", () => {
  assert.equal(selectAcceptedOffer([{ status: "draft" }, { status: "sent" }]), null);
  assert.deepEqual(selectAcceptedOffer([{ status: "sent" }, { status: "accepted", id: 1 }]), { status: "accepted", id: 1 });
});

test("depositFor: pct rule computes round(total_cents * pct / 100)", () => {
  assert.deepEqual(depositFor(OFFER_PCT), { amountCents: 30000, pct: 30 });
});

test("depositFor: an explicit deposit_amount_cents wins over pct", () => {
  assert.deepEqual(depositFor(OFFER_CENTS), { amountCents: 15000, pct: null });
});

test("depositFor: no rule at all is null, not zero", () => {
  assert.equal(depositFor(OFFER_NONE), null);
  assert.equal(depositFor(null), null);
});

test("fullAmountCentsFor: offer total in cents, null with no offer", () => {
  assert.equal(fullAmountCentsFor(OFFER_PCT), 100000);
  assert.equal(fullAmountCentsFor(null), null);
});

test("amountOptions: deposit omitted (not disabled) with no rule", () => {
  const withDeposit = amountOptions(OFFER_PCT).map((o) => o.kind);
  assert.deepEqual(withDeposit, ["deposit", "full", "other"]);
  const withoutDeposit = amountOptions(OFFER_NONE).map((o) => o.kind);
  assert.deepEqual(withoutDeposit, ["full", "other"]);
  const withoutOffer = amountOptions(null).map((o) => o.kind);
  assert.deepEqual(withoutOffer, ["full", "other"]);
});

test("dollarsToCents: only a real positive amount parses", () => {
  assert.equal(dollarsToCents("150"), 15000);
  assert.equal(dollarsToCents("150.50"), 15050);
  assert.equal(dollarsToCents("1,250"), 125000);
  assert.equal(dollarsToCents(""), null);
  assert.equal(dollarsToCents("0"), null);
  assert.equal(dollarsToCents("-5"), null);
  assert.equal(dollarsToCents("abc"), null);
});

const CHIP_ORDER = { kind: "order" as const, recordId: "or-1", label: "#1" };
const CHIP_APPT = { kind: "appointment" as const, recordId: "ap-1", label: "AP-1" };
const CHIP_OFFER = { kind: "offer" as const, recordId: "iq-1", label: "Offer" };
const CHIP_PROJECT = { kind: "project" as const, recordId: "pj-1", label: "Project" };

test("paymentTargetsFrom: excludes project (no money leg)", () => {
  const targets = paymentTargetsFrom([CHIP_ORDER, CHIP_APPT, CHIP_OFFER, CHIP_PROJECT]);
  assert.deepEqual(targets.map((t) => t.kind), ["order", "appointment", "offer"]);
});

test("defaultPaymentTarget: prefers the order chip over any other kind", () => {
  assert.deepEqual(defaultPaymentTarget([CHIP_APPT, CHIP_ORDER, CHIP_OFFER]), CHIP_ORDER);
  assert.deepEqual(defaultPaymentTarget([CHIP_APPT, CHIP_OFFER]), CHIP_APPT);
  assert.equal(defaultPaymentTarget([CHIP_PROJECT]), null);
  assert.equal(defaultPaymentTarget([]), null);
});

test("canMintPaymentLink: only an order chip resolves to an orders.id", () => {
  assert.equal(canMintPaymentLink(CHIP_ORDER), true);
  assert.equal(canMintPaymentLink(CHIP_APPT), false);
  assert.equal(canMintPaymentLink(CHIP_OFFER), false);
  assert.equal(canMintPaymentLink(null), false);
});

test("openRequestFor: requested or opened blocks a second request", () => {
  assert.deepEqual(openRequestFor([{ paymentState: "paid" }, { paymentState: "requested" }]), { paymentState: "requested" });
  assert.deepEqual(openRequestFor([{ paymentState: "opened" }]), { paymentState: "opened" });
  assert.equal(openRequestFor([{ paymentState: "paid" }, { paymentState: null }]), null);
  assert.equal(openRequestFor([]), null);
});

test("cancelTargetsFrom: excludes offer and project (no money leg)", () => {
  const targets = cancelTargetsFrom([CHIP_ORDER, CHIP_APPT, CHIP_OFFER, CHIP_PROJECT]);
  assert.deepEqual(targets.map((t) => t.kind), ["order", "appointment"]);
});

test("defaultCancelTarget: the first cancellable chip, or null with none", () => {
  assert.deepEqual(defaultCancelTarget([CHIP_OFFER, CHIP_APPT, CHIP_ORDER]), CHIP_APPT);
  assert.equal(defaultCancelTarget([CHIP_OFFER, CHIP_PROJECT]), null);
});

test("refundOptions: full/partial capped at refundable, keep always enabled", () => {
  const options = refundOptions({ refundableCents: 5000, depositRefundable: true });
  assert.deepEqual(options, [
    { mode: "full", enabled: true, maxCents: 5000 },
    { mode: "partial", enabled: true, maxCents: 5000 },
    { mode: "keep", enabled: true, maxCents: 0 },
  ]);
});

test("refundOptions: an enforced window (depositRefundable false) zeroes the money choices", () => {
  const options = refundOptions({ refundableCents: 5000, depositRefundable: false });
  assert.deepEqual(options, [
    { mode: "full", enabled: false, maxCents: 0 },
    { mode: "partial", enabled: false, maxCents: 0 },
    { mode: "keep", enabled: true, maxCents: 0 },
  ]);
});

test("partialAmountValid: inside (0, max] only", () => {
  assert.equal(partialAmountValid(500, 1000), true);
  assert.equal(partialAmountValid(1000, 1000), true);
  assert.equal(partialAmountValid(1001, 1000), false);
  assert.equal(partialAmountValid(0, 1000), false);
  assert.equal(partialAmountValid(null, 1000), false);
});

test("footerLabelKindFor: money moving reads 'Cancel and refund', keep/zero reads 'Cancel'", () => {
  assert.equal(footerLabelKindFor("full", 5000), "cancelAndRefund");
  assert.equal(footerLabelKindFor("partial", 500), "cancelAndRefund");
  assert.equal(footerLabelKindFor("keep", 0), "cancelOnly");
  assert.equal(footerLabelKindFor("full", 0), "cancelOnly");
});
