import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_ALLOCATIONS_PER_ORDER,
  buildPerUnitRequests,
  type CapacityNeed,
} from "./capacity-requests";

const need = (over: Partial<CapacityNeed> = {}): CapacityNeed => ({
  offeringId: "off1", poolId: "pool1", startsAt: null, endsAt: null, units: 1, ...over,
});

const lines = new Map([["off1", "line1"], ["off2", "line2"]]);

test("4 units become FOUR single-unit requests, not one of four", () => {
  // The whole ruling. One allocation of N cannot be partially released:
  // release_capacity takes ids, and freeing the allocation frees every seat on
  // it while the kept tickets are still valid.
  const r = buildPerUnitRequests([need({ units: 4 })], lines);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.requests.length, 4);
  assert.ok(r.requests.every((q) => q.units === 1), "every request is one seat");
});

test("each request carries the line attribution", () => {
  // `capacity_allocations.order_line_id` is what refund-by-line reads to decide
  // which seats to free. A wrong stamp means refunding GA releases the VIP.
  const r = buildPerUnitRequests([need({ units: 2 })], lines);
  assert.equal(r.ok && r.requests.every((q) => q.orderLineId === "line1"), true);
});

test("two lines keep their own attribution and window", () => {
  const r = buildPerUnitRequests(
    [need({ units: 2 }), need({ offeringId: "off2", poolId: "pool2", units: 1, startsAt: "2026-01-01T00:00:00Z" })],
    lines,
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.requests.length, 3);
  assert.equal(r.requests.filter((q) => q.orderLineId === "line1").length, 2);
  const other = r.requests.find((q) => q.orderLineId === "line2");
  assert.equal(other?.poolId, "pool2");
  assert.equal(other?.startsAt, "2026-01-01T00:00:00Z");
});

test("zero or fractional units still reserve ONE seat, never none", () => {
  // Reserving nothing for a line that was sold is the oversell this path
  // exists to prevent, so the clamp is upward.
  for (const units of [0, -3, 0.4, undefined]) {
    const r = buildPerUnitRequests([need({ units: units as number | undefined })], lines);
    assert.equal(r.ok && r.requests.length, 1, `units=${String(units)}`);
  }
  // 2.9 floors to 2 rather than rounding to 3: never reserve more than asked.
  const frac = buildPerUnitRequests([need({ units: 2.9 })], lines);
  assert.equal(frac.ok && frac.requests.length, 2);
});

test("an absurd unit count REFUSES rather than building an unbounded array", () => {
  const r = buildPerUnitRequests([need({ units: 10_000 })], lines);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, "too_many_allocations");
    // Bounded WHILE building, so the refusal does not require materialising
    // ten thousand objects first.
    assert.ok(r.count <= MAX_ALLOCATIONS_PER_ORDER + 1, `built ${r.count} before refusing`);
  }
});

test("a line with an unknown offering gets a null attribution, not a wrong one", () => {
  // Better an unattributed allocation than one stamped with someone else's
  // line, which refund-by-line would then free.
  const r = buildPerUnitRequests([need({ offeringId: "unknown" })], lines);
  assert.equal(r.ok && r.requests[0]?.orderLineId, null);
});
