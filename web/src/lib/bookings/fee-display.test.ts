import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { effectiveFeeLabel } from "./fee-display";

test("TUL-1176: a pass-through row with stored 0 bps but a real fee shows the effective rate", () => {
  // 148 bps of 100000 = 1480 cents; stored bps is 0 (pass-through)
  assert.equal(effectiveFeeLabel({ platformFeeCents: 1480, grossAmountCents: 100000, storedBasisPoints: 0 }), "1.5%");
});

test("a normal row shows the rate it was charged at", () => {
  assert.equal(effectiveFeeLabel({ platformFeeCents: 1000, grossAmountCents: 10000, storedBasisPoints: 1000 }), "10%");
  assert.equal(effectiveFeeLabel({ platformFeeCents: 500, grossAmountCents: 10000, storedBasisPoints: 500 }), "5%");
});

test("the effective rate wins over a wrong stored value", () => {
  assert.equal(effectiveFeeLabel({ platformFeeCents: 600, grossAmountCents: 10000, storedBasisPoints: 0 }), "6%");
});

test("a genuinely free row (fee 0) reads 0%", () => {
  assert.equal(effectiveFeeLabel({ platformFeeCents: 0, grossAmountCents: 10000, storedBasisPoints: 0 }), "0%");
});

test("no gross to derive from falls back to the stored value, never NaN", () => {
  assert.equal(effectiveFeeLabel({ platformFeeCents: 0, grossAmountCents: 0, storedBasisPoints: 250 }), "2.5%");
  assert.equal(effectiveFeeLabel({ platformFeeCents: Number.NaN, grossAmountCents: Number.NaN, storedBasisPoints: Number.NaN }), "0%");
});

test("a commission snapshot wins: its rate is shown, whole percent, whatever the transaction says", () => {
  const snapshot = { platformFeeCents: 1500, grossChargedCents: 10000 };
  assert.equal(effectiveFeeLabel({ platformFeeCents: 1480, grossAmountCents: 100000, storedBasisPoints: 0, snapshot }), "15%");
  // same output the page printed before this change for a snapshot
  assert.equal(effectiveFeeLabel({ platformFeeCents: 0, grossAmountCents: 0, storedBasisPoints: 0, snapshot: { platformFeeCents: 750, grossChargedCents: 10000 } }), "8%");
  assert.equal(effectiveFeeLabel({ platformFeeCents: 0, grossAmountCents: 0, storedBasisPoints: 0, snapshot: { platformFeeCents: 0, grossChargedCents: 0 } }), "0%");
});

test("no snapshot (null or absent): derive from the transaction's charged fee", () => {
  const base = { platformFeeCents: 1480, grossAmountCents: 100000, storedBasisPoints: 0 };
  assert.equal(effectiveFeeLabel({ ...base, snapshot: null }), "1.5%");
  assert.equal(effectiveFeeLabel(base), "1.5%");
});

test("the work page prefers the snapshot breakdown and only falls back to the derived label", () => {
  const src = readFileSync(join(process.cwd(), "src/app/(workspace)/[tenantSlug]/admin/work/[id]/page.tsx"), "utf8");
  assert.match(src, /const effectiveBreakdown = snapBreakdown \?\? breakdown;/);
  assert.match(src, /snapshot: \{ platformFeeCents: snapPlatformCents, grossChargedCents: snapGrossChargedCents \}/);
});

test("the work page derives its label from the charged fee, not the stored bps", () => {
  const src = readFileSync(join(process.cwd(), "src/app/(workspace)/[tenantSlug]/admin/work/[id]/page.tsx"), "utf8");
  assert.match(src, /effectiveFeeLabel\(/);
  assert.doesNotMatch(src, /feePercent\(transaction\.platformFeeBasisPoints\)/);
});

test("display-only: no charge, commission, payout or refund module imports the display helper", () => {
  for (const f of [
    "src/lib/bookings/commission.ts",
    "src/lib/bookings/transactions.ts",
    "src/lib/payments/refunds.ts",
    "src/lib/payments/link-checkout.ts",
    "src/lib/orders/purchase.ts",
  ]) {
    assert.doesNotMatch(readFileSync(join(process.cwd(), f), "utf8"), /fee-display/, f);
  }
});
