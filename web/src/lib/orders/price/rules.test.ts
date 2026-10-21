import assert from "node:assert/strict";
import test from "node:test";

import { amountToCollectCents } from "@/lib/orders/purchase-pricing";
import { balanceCents, collectNowCents, depositCents, effectiveUnitCents, priceDueNow, transactionPrincipalCents } from "./rules";
import { selectionSummary } from "./display";

test("the deposit is the checkout's own floor (TUL-1304: 1999 at 50% is 999, not 1000)", () => {
  assert.equal(depositCents(1_999, 50), 999);
  assert.equal(depositCents(3_334, 25), 833);
  assert.equal(depositCents(9_999, 50), 4_999);
  for (const [total, pct] of [[10_000, 30], [1_999, 50], [33_333, 30], [7, 33.5], [100, 99]] as const) {
    assert.equal(depositCents(total, pct), amountToCollectCents(total, "deposit", pct));
  }
});

test("collectNowCents follows the reserve mode; a missing or out-of-range % means full", () => {
  assert.equal(collectNowCents(null, "deposit", 30), null);
  assert.equal(collectNowCents(10_000, "free", null), 0);
  assert.equal(collectNowCents(10_000, "full", 30), 10_000);
  assert.equal(collectNowCents(10_000, "deposit", 30), 3_000);
  assert.equal(collectNowCents(10_000, "deposit", 0), 10_000);
  assert.equal(collectNowCents(10_000, "deposit", 100), 10_000);
  assert.equal(collectNowCents(10_000, "deposit", Number.NaN), 10_000);
  assert.equal(collectNowCents(10_000, "deposit", null), 10_000);
});

test("TUL-1301: a tier with no price of its own shows the offering price that is charged, not Free", () => {
  assert.equal(effectiveUnitCents(null, 2_500), 2_500);
  assert.equal(effectiveUnitCents(undefined, 2_500), 2_500);
  assert.equal(effectiveUnitCents(8_000, 2_500), 8_000);
  // A tier explicitly priced 0 is free and stays free.
  assert.equal(effectiveUnitCents(0, 2_500), 0);
  assert.equal(effectiveUnitCents(null, null), null);
});

test("TUL-1304: the promo-adjusted total drives the deposit and the balance (shows 8000, not 10000)", () => {
  const due = priceDueNow({ subtotalCents: 10_000, discountCents: 2_000, collect: "full", depositPct: null, payInPerson: false });
  assert.deepEqual(due, { subtotalCents: 10_000, discountCents: 2_000, totalCents: 8_000, principalCents: 8_000, balanceCents: 0 });
  const dep = priceDueNow({ subtotalCents: 20_000, discountCents: 5_000, collect: "deposit", depositPct: 30, payInPerson: false });
  assert.equal(dep.totalCents, 15_000);
  assert.equal(dep.principalCents, 4_500);
  assert.equal(dep.balanceCents, 10_500);
});

test("a discount can never exceed the subtotal or go negative; pay in person owes nothing now", () => {
  assert.equal(priceDueNow({ subtotalCents: 1_000, discountCents: 5_000, collect: "full", depositPct: null, payInPerson: false }).totalCents, 0);
  assert.equal(priceDueNow({ subtotalCents: 1_000, discountCents: -5, collect: "full", depositPct: null, payInPerson: false }).totalCents, 1_000);
  const door = priceDueNow({ subtotalCents: 8_000, discountCents: 0, collect: "none", depositPct: null, payInPerson: true });
  assert.equal(door.principalCents, 0);
  assert.equal(door.balanceCents, 8_000);
});

test("TUL-1305: the balance is the total minus the PRINCIPAL, never minus the gross with the card fee", () => {
  // 100000 order, 30% deposit = 30000 principal, 450 card fee: 30450 charged. Owed: 70000, not 69550.
  assert.equal(balanceCents(100_000, 30_000), 70_000);
  assert.equal(transactionPrincipalCents({ grossCents: 30_450, netCents: 30_000, feeNetted: false }), 30_000);
  assert.equal(balanceCents(100_000, transactionPrincipalCents({ grossCents: 30_450, netCents: 30_000, feeNetted: false })), 70_000);
  // A fee-netted inquiry row (net = gross - commission) credited the gross.
  assert.equal(transactionPrincipalCents({ grossCents: 30_000, netCents: 28_500, feeNetted: true }), 30_000);
  // Inconsistent rows fall back to the gross, which is what the emails showed before.
  assert.equal(transactionPrincipalCents({ grossCents: 30_000, netCents: 0, feeNetted: false }), 30_000);
  assert.equal(transactionPrincipalCents({ grossCents: 30_000, netCents: 31_000, feeNetted: false }), 30_000);
  assert.equal(balanceCents(1_000, 5_000), 0);
});

test("the summary renders the quote and computes nothing", () => {
  const s = selectionSummary({ currency: "MXN", totalCents: 8_000, discountCents: 2_000, collectCents: 8_120, cardFeeCents: 120, principalCents: 8_000, balanceCents: 0, travelFeeOnDayCents: 0 });
  assert.deepEqual(s, { currency: "MXN", totalCents: 8_000, discountCents: 2_000, feeCents: 120, payNowCents: 8_120, balanceCents: 0, travelFeeOnDayCents: 0, showPayNow: true });
  const plain = selectionSummary({ currency: "MXN", totalCents: 8_000, discountCents: 0, collectCents: 8_000, cardFeeCents: 0, principalCents: 8_000, balanceCents: 0, travelFeeOnDayCents: 0 });
  assert.equal(plain.showPayNow, false);
  const dep = selectionSummary({ currency: "MXN", totalCents: 10_000, discountCents: 0, collectCents: 3_000, cardFeeCents: 0, principalCents: 3_000, balanceCents: 7_000, travelFeeOnDayCents: 0 });
  assert.equal(dep.showPayNow, true);
  assert.equal(dep.balanceCents, 7_000);
});
