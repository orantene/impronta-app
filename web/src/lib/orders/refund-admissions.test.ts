import test from "node:test";
import assert from "node:assert/strict";

import { capacityReleaseFor, selectAdmissionsForRefund } from "./refund-admissions";

const adm = (id: string, lineSeq: number, admittedCount = 0, status = "valid") =>
  ({ id, orderLineId: "L1", lineSeq, admittedCount, status });

const FOUR = [adm("a0", 0), adm("a1", 1), adm("a2", 2), adm("a3", 3)];

test("takes the HIGHEST line_seq first, so the buyer's first tickets survive", () => {
  const r = selectAdmissionsForRefund(FOUR, 2);
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.admissionIds, ["a3", "a2"]);
});

test("NEVER selects an admission that has already been scanned in", () => {
  // Someone who walked in and then wants money back is a dispute, not a
  // refund-by-line. This path must not be able to reach them.
  const scanned = [adm("a0", 0), adm("a1", 1), adm("a2", 2, 1), adm("a3", 3, 1)];
  const r = selectAdmissionsForRefund(scanned, 2);
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.admissionIds, ["a1", "a0"], "only the unadmitted two");
});

test("refuses when scanned tickets make the count impossible, and says how many WERE available", () => {
  const scanned = [adm("a0", 0), adm("a1", 1, 1), adm("a2", 2, 1), adm("a3", 3, 1)];
  const r = selectAdmissionsForRefund(scanned, 3);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, "already_admitted");
    // The refusal tells a venue what it CAN do, not only what it cannot.
    assert.equal(r.availableCount, 1);
  }
});

test("'some were scanned' and 'there were never that many' are different refusals", () => {
  // A venue reads these differently: one is a dispute, the other a typo.
  const never = selectAdmissionsForRefund([adm("a0", 0)], 3);
  assert.equal(never.ok, false);
  if (!never.ok) assert.equal(never.reason, "not_enough_admissions");
});

test("an already-refunded admission is not selected twice", () => {
  const mixed = [adm("a0", 0), adm("a1", 1, 0, "refunded"), adm("a2", 2)];
  const r = selectAdmissionsForRefund(mixed, 2);
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.admissionIds, ["a2", "a0"]);
});

test("a whole-line refund may release capacity", () => {
  assert.deepEqual(capacityReleaseFor(true), {
    release: true, reason: "whole_line_refunded",
  });
});

test("a PARTIAL refund must NOT release capacity — the engine has no partial release", () => {
  // `release_capacity(p_allocation_ids uuid[])` releases WHOLE allocations, and
  // a line holds ONE allocation of N units. Releasing it on a 2-of-4 refund
  // frees all four seats while two tickets are still valid — an oversell by
  // exactly the number kept, found by a person at a door who cannot get in.
  const r = capacityReleaseFor(false);
  assert.equal(r.release, false);
  assert.equal(r.reason, "partial_refund_cannot_release_units");
});
