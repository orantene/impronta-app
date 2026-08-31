/**
 * commission.test.ts — arithmetic and formatting only.
 *
 * The plan-tier → rate assertions that used to live here were deleted on
 * 2026-08-30 along with the divergent `FEE_TABLE` they locked in place (free 0,
 * studio 1100, agency 1750 against a ratified 600). Rate resolution is now
 * tested in `@/lib/billing/platform-take-rate.test.ts` against the same config
 * the canonical booking resolver reads.
 *
 * Keep this file free of tier names. A test that hardcodes "agency → 1750" is
 * how the second rate table survived as long as it did.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  calculateTransactionAmountsForBasisPoints,
  feePercent,
} from "@/lib/bookings/commission";

test("resolved basis points can be applied directly", () => {
  assert.deepEqual(calculateTransactionAmountsForBasisPoints(10_000, 0), {
    grossCents: 10_000,
    feeBasisPoints: 0,
    feeCents: 0,
    netCents: 10_000,
  });

  assert.deepEqual(calculateTransactionAmountsForBasisPoints(10_000, 600), {
    grossCents: 10_000,
    feeBasisPoints: 600,
    feeCents: 600,
    netCents: 9_400,
  });
});

test("fee is floored so rounding never over-charges the payer", () => {
  // 999 × 600 / 10000 = 59.94 → 59, and net keeps the spare cent.
  assert.deepEqual(calculateTransactionAmountsForBasisPoints(999, 600), {
    grossCents: 999,
    feeBasisPoints: 600,
    feeCents: 59,
    netCents: 940,
  });
});

test("fee + net always reconstructs gross exactly", () => {
  for (const gross of [1, 7, 99, 100, 333, 1_000, 12_345, 999_999]) {
    for (const bps of [0, 1, 300, 600, 1750, 10_000]) {
      const a = calculateTransactionAmountsForBasisPoints(gross, bps);
      assert.equal(
        a.feeCents + a.netCents,
        gross,
        `lane drift at gross=${gross} bps=${bps}`,
      );
      assert.ok(a.feeCents >= 0 && a.netCents >= 0, `negative lane at gross=${gross} bps=${bps}`);
    }
  }
});

test("invalid inputs throw rather than silently mis-charging", () => {
  assert.throws(() => calculateTransactionAmountsForBasisPoints(0, 600));
  assert.throws(() => calculateTransactionAmountsForBasisPoints(-1, 600));
  assert.throws(() => calculateTransactionAmountsForBasisPoints(100, -1));
  assert.throws(() => calculateTransactionAmountsForBasisPoints(100, 1.5));
});

test("fee percentage display stays compact", () => {
  assert.equal(feePercent(600), "6%");
  assert.equal(feePercent(300), "3%");
  assert.equal(feePercent(1750), "17.5%");
});
