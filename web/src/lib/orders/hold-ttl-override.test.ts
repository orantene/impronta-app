import test from "node:test";
import assert from "node:assert/strict";

import { resolveHoldTtl } from "@/lib/orders/purchase";

const FIFTEEN_MIN = 15 * 60;
const THIRTY_DAYS = 30 * 24 * 60 * 60;

test("no override uses the pools' own shortest TTL", () => {
  assert.equal(resolveHoldTtl(600, null), 600);
  assert.equal(resolveHoldTtl(600, undefined), 600);
});

test("no pools and no override falls back, never to zero", () => {
  // A zero TTL is a hold that expires immediately: the seat is gone before the
  // customer reaches Checkout.
  assert.equal(resolveHoldTtl(null, null), FIFTEEN_MIN);
});

test("a door-time override outlives the pool default, which is the point", () => {
  // Pay-at-the-door: hold until the event, commit at settlement. Fifteen
  // minutes would lapse long before the doors open.
  const sixHours = 6 * 60 * 60;
  assert.equal(resolveHoldTtl(FIFTEEN_MIN, sixHours), sixHours);
});

test("an absurd override is CLAMPED, not honoured", () => {
  // An unbounded hold is the commit-with-no-TTL problem wearing a new name:
  // nothing reclaims it, and the seat is gone forever.
  assert.equal(resolveHoldTtl(600, Number.MAX_SAFE_INTEGER), THIRTY_DAYS);
  assert.equal(resolveHoldTtl(600, THIRTY_DAYS * 10), THIRTY_DAYS);
});

test("zero, negative and non-finite fall back rather than producing a broken hold", () => {
  // Each of these would otherwise mean "expires now" or "never expires", and
  // both are worse than the default.
  for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(resolveHoldTtl(600, bad), 600, `override=${String(bad)}`);
  }
});

test("a fractional override floors rather than rounding up", () => {
  // Never hand out more hold than was asked for.
  assert.equal(resolveHoldTtl(600, 90.9), 90);
});
