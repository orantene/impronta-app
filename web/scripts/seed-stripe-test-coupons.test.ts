import assert from "node:assert/strict";
import { test } from "node:test";

import { PLANNED_COUPONS, assertTestKey, shouldApply } from "./seed-stripe-test-coupons.mjs";

test("refuses live keys and anything not sk_test_", () => {
  assert.throws(() => assertTestKey("K", "sk_live_abc"), /not a TEST key/);
  assert.throws(() => assertTestKey("K", "rk_live_abc"), /not a TEST key/);
  assert.throws(() => assertTestKey("K", "rk_test_abc"), /not a TEST key/);
  assert.equal(assertTestKey("K", "sk_test_abc"), "sk_test_abc");
  assert.equal(assertTestKey("K", undefined), null);
});

test("dry run is the default; --apply is required to write; --dry-run wins", () => {
  assert.equal(shouldApply([]), false);
  assert.equal(shouldApply(["--dry-run"]), false);
  assert.equal(shouldApply(["--apply"]), true);
  assert.equal(shouldApply(["--apply", "--dry-run"]), false);
});

type CouponSpec = { id: string; code: string; percent_off: number; duration_in_months: number };

test("plans the two agreed coupons and codes", () => {
  const specs: CouponSpec[] = PLANNED_COUPONS;
  const byCode: Record<string, CouponSpec> = Object.fromEntries(specs.map((c) => [c.code, c]));
  assert.equal(byCode.TESTPRO20.percent_off, 20);
  assert.equal(byCode.TESTPRO20.duration_in_months, 3);
  assert.equal(byCode.TESTFREE1M.percent_off, 100);
  assert.equal(byCode.TESTFREE1M.duration_in_months, 1);
  assert.equal(new Set(specs.map((c) => c.id)).size, specs.length);
});
