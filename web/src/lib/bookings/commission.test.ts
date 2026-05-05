import { test } from "node:test";
import assert from "node:assert/strict";

import {
  calculateTransactionAmounts,
  calculateTransactionAmountsForBasisPoints,
  feePercent,
  getFeeBasisPoints,
} from "@/lib/bookings/commission";

test("plan tiers resolve to the locked fee basis points", () => {
  assert.equal(getFeeBasisPoints("free"), 0);
  assert.equal(getFeeBasisPoints("studio"), 1100);
  assert.equal(getFeeBasisPoints("agency"), 1750);
  assert.equal(getFeeBasisPoints("network"), 1750);
  // M15: unknown tier must fall back to 0 (free / no fee), not 1100 (studio).
  assert.equal(getFeeBasisPoints("unknown"), 0);
});

test("transaction amounts use the plan tier mapping", () => {
  assert.deepEqual(calculateTransactionAmounts(10_000, "agency"), {
    grossCents: 10_000,
    feeBasisPoints: 1750,
    feeCents: 1750,
    netCents: 8250,
  });
});

test("resolved basis points can be applied directly", () => {
  assert.deepEqual(calculateTransactionAmountsForBasisPoints(10_000, 0), {
    grossCents: 10_000,
    feeBasisPoints: 0,
    feeCents: 0,
    netCents: 10_000,
  });

  assert.deepEqual(calculateTransactionAmountsForBasisPoints(999, 1750), {
    grossCents: 999,
    feeBasisPoints: 1750,
    feeCents: 174,
    netCents: 825,
  });
});

test("fee percentage display stays compact", () => {
  assert.equal(feePercent(1100), "11%");
  assert.equal(feePercent(1750), "17.5%");
});
