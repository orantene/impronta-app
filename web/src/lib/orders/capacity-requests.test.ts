import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_ALLOCATIONS_PER_ORDER,
  buildCapacityRequests,
  type CapacityNeed,
} from "./capacity-requests";

const need = (over: Partial<CapacityNeed> = {}): CapacityNeed => ({
  offeringId: "off1", poolId: "pool1", startsAt: null, endsAt: null, units: 1,
  // Existing cases all cover the SEATED branch; the pooled branch is new below.
  perUnitDomainRow: true, ...over,
});

const lines = new Map([["off1", "line1"], ["off2", "line2"]]);

test("4 units become FOUR single-unit requests, not one of four", () => {
  // The whole ruling. One allocation of N cannot be partially released:
  // release_capacity takes ids, and freeing the allocation frees every seat on
  // it while the kept tickets are still valid.
  const r = buildCapacityRequests([need({ units: 4 })], lines);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.requests.length, 4);
  assert.ok(r.requests.every((q) => q.units === 1), "every request is one seat");
});

test("each request carries the line attribution", () => {
  // `capacity_allocations.order_line_id` is what refund-by-line reads to decide
  // which seats to free. A wrong stamp means refunding GA releases the VIP.
  const r = buildCapacityRequests([need({ units: 2 })], lines);
  assert.equal(r.ok && r.requests.every((q) => q.orderLineId === "line1"), true);
});

test("two lines keep their own attribution and window", () => {
  const r = buildCapacityRequests(
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

test("a FRACTIONAL units REFUSES — it must never round", () => {
  // Capacity's blocker, and it is live: `order_lines.units` is NUMERIC(12,3)
  // and the policy gate admits any finite positive value, so 2.5 reaches here.
  // `capacity_allocations.units` is INTEGER and `reserve_capacity_batch` does
  // `(r->>'units')::int`, which fails on "2.5" with invalid_text_representation
  // — an opaque cast error from inside a function, not a refusal.
  //
  // Rounding would be WORSE than the crash: floor on a 2.5-unit line reserves 2
  // and sells 2.5, so half a unit of stock vanishes at checkout, silently, on
  // the one path whose whole job is not to oversell.
  for (const units of [2.5, 0.4, 2.9]) {
    const r = buildCapacityRequests([need({ units })], lines);
    assert.equal(r.ok, false, `units=${units} must refuse`);
    if (!r.ok) {
      assert.equal(r.reason, "fractional_units_unsupported");
      // Names the offering, so the refusal points at a row a person can fix.
      assert.equal((r as { offeringId: string }).offeringId, "off1");
    }
  }
});

test("zero or negative units still reserve ONE seat, never none", () => {
  // Clamped UPWARD: reserving nothing for a line that was sold is the oversell
  // this path exists to prevent.
  for (const units of [0, -3, undefined]) {
    const r = buildCapacityRequests([need({ units: units as number | undefined })], lines);
    assert.equal(r.ok && r.requests.length, 1, `units=${String(units)}`);
  }
});

test("a POOLED line keeps ONE allocation of N — fifty rows would fake identity", () => {
  // Capacity's second blocker. Fifty allocations for fifty coffees carry no
  // per-unit id, so refunding 2 picks "any 2 live ones" and a RETRY PICKS TWO
  // MORE. That is quantity release wearing row clothing — the feeling of
  // identity without the property, and worse than one row of fifty because the
  // defect is invisible rather than obvious.
  const r = buildCapacityRequests([need({ units: 50, perUnitDomainRow: false })], lines);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.requests.length, 1, "one allocation, not fifty");
  assert.equal(r.requests[0]?.units, 50);
});

test("the two shapes coexist in one cart, each keeping its own", () => {
  const r = buildCapacityRequests(
    [
      need({ units: 3, perUnitDomainRow: true }),
      need({ offeringId: "off2", poolId: "pool2", units: 40, perUnitDomainRow: false }),
    ],
    lines,
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.requests.filter((q) => q.orderLineId === "line1").length, 3, "seated: one per seat");
  const pooled = r.requests.filter((q) => q.orderLineId === "line2");
  assert.equal(pooled.length, 1, "pooled: one allocation");
  assert.equal(pooled[0]?.units, 40);
});

test("an absurd unit count REFUSES rather than building an unbounded array", () => {
  const r = buildCapacityRequests([need({ units: 10_000 })], lines);
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
  const r = buildCapacityRequests([need({ offeringId: "unknown" })], lines);
  assert.equal(r.ok && r.requests[0]?.orderLineId, null);
});
