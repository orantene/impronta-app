import assert from "node:assert/strict";
import { test } from "node:test";

import { movementSum } from "./CashDrawerScreen";
import { TIP_PERCENTS, tipForPercent } from "./TipSheet";

test("a percentage tip is rounded to the nearest minor unit and never negative", () => {
  assert.deepEqual(TIP_PERCENTS, [10, 15, 20]);
  assert.equal(tipForPercent(4250, 10), 425);
  assert.equal(tipForPercent(4250, 15), 638);
  assert.equal(tipForPercent(4250, 20), 850);
  assert.equal(tipForPercent(-100, 10), 0);
});

test("the close card sums one kind of movement at a time", () => {
  const movements = [
    { id: "a", kind: "drop" as const, amountCents: 30000, reason: "", createdAt: "" },
    { id: "b", kind: "drop" as const, amountCents: 500, reason: "", createdAt: "" },
    { id: "c", kind: "paid_out" as const, amountCents: 1200, reason: "", createdAt: "" },
  ];
  assert.equal(movementSum(movements, "drop"), 30500);
  assert.equal(movementSum(movements, "paid_out"), 1200);
  assert.equal(movementSum(movements, "float_add"), 0);
  assert.equal(movementSum(undefined, "drop"), 0);
});
