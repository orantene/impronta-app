import assert from "node:assert/strict";
import test from "node:test";

import { planAdmissions } from "./mint-admissions";

const BASE = {
  orderLineId: "line-1",
  sessionId: "sess-1",
  allocationId: "alloc-1",
  startsAt: "2026-09-13T21:00:00.000Z",
};

test("four GA tickets are FOUR rows admitting one each, not one row of four", () => {
  const plan = planAdmissions({ ...BASE, units: 4, admitsPerUnit: 1 });
  assert.ok(plan.ok);
  assert.equal(plan.rows.length, 4);
  assert.deepEqual([...new Set(plan.rows.map((r) => r.partySize))], [1]);
  assert.equal(plan.totalPeople, 4);
  // One QR per admission is the receipt's whole shape; one row of four would
  // give a party of strangers a single ticket between them.
});

test("one VIP table for six is ONE row admitting six, not six rows", () => {
  const plan = planAdmissions({ ...BASE, units: 1, admitsPerUnit: 6 });
  assert.ok(plan.ok);
  assert.equal(plan.rows.length, 1);
  assert.equal(plan.rows[0]?.partySize, 6);
  assert.equal(plan.totalPeople, 6);
  // Six rows would put six lines on a host stand for one table, and the door
  // would ask a table of six to present six separate QRs.
});

test("two VIP tables are TWO rows of six, never one row of twelve", () => {
  const plan = planAdmissions({ ...BASE, units: 2, admitsPerUnit: 6 });
  assert.ok(plan.ok);
  assert.equal(plan.rows.length, 2);
  assert.deepEqual(plan.rows.map((r) => r.partySize), [6, 6]);
  assert.equal(plan.totalPeople, 12);
  // The tables are admitted, seated and potentially refunded separately.
});

test("every row carries the line, so refund-by-line frees the right seats", () => {
  const plan = planAdmissions({ ...BASE, units: 3, admitsPerUnit: 1 });
  assert.ok(plan.ok);
  for (const r of plan.rows) {
    assert.equal(r.orderLineId, "line-1");
    // Rows of one line share the line's allocation: one allocation of 3 units
    // backs three ticket rows. Attribution stays per-row via order_line_id.
    assert.equal(r.allocationId, "alloc-1");
    assert.equal(r.sessionId, "sess-1");
    assert.equal(r.startsAt, "2026-09-13T21:00:00.000Z");
  }
});

test("named attendees attach per row, and a partial list is refused", () => {
  const named = planAdmissions({
    ...BASE,
    units: 2,
    admitsPerUnit: 1,
    holders: [
      { name: "Ana Rivera", email: "ana@example.com" },
      { name: "Luis Ortiz", email: null },
    ],
  });
  assert.ok(named.ok);
  assert.equal(named.rows[0]?.holderName, "Ana Rivera");
  assert.equal(named.rows[0]?.holderEmail, "ana@example.com");
  assert.equal(named.rows[1]?.holderName, "Luis Ortiz");
  assert.equal(named.rows[1]?.holderEmail, null);

  // A short list would leave the last ticket nameless while looking deliberate,
  // which at a door is indistinguishable from a ticket nobody bought.
  const short = planAdmissions({
    ...BASE,
    units: 3,
    admitsPerUnit: 1,
    holders: [{ name: "Ana Rivera" }],
  });
  assert.deepEqual(short, { ok: false, reason: "holder_count_mismatch", expected: 3, got: 1 });
});

test("a nonsense count refuses instead of emitting an empty or fractional plan", () => {
  assert.deepEqual(planAdmissions({ ...BASE, units: 0, admitsPerUnit: 1 }),
    { ok: false, reason: "not_a_count" });
  assert.deepEqual(planAdmissions({ ...BASE, units: 2.5, admitsPerUnit: 1 }),
    { ok: false, reason: "not_a_count" });
  // admitsPerUnit of 0 would mint rows admitting nobody, which pass every CHECK
  // and are found by a person holding a ticket that lets no one in.
  assert.deepEqual(planAdmissions({ ...BASE, units: 1, admitsPerUnit: 0 }),
    { ok: false, reason: "not_a_count" });
});

test("the anchor rule is checked here, so the refusal names the problem", () => {
  const orphan = planAdmissions({
    orderLineId: "",
    units: 1,
    admitsPerUnit: 1,
  });
  assert.deepEqual(orphan, { ok: false, reason: "not_anchored" });

  // A cash door sale: no order line, no space, but a session and an allocation.
  // Case 5 of the migration's five, and it must PASS.
  const cashWalkUp = planAdmissions({
    orderLineId: "",
    units: 1,
    admitsPerUnit: 1,
    sessionId: "sess-1",
    allocationId: "alloc-9",
  });
  assert.ok(cashWalkUp.ok);
  assert.equal(cashWalkUp.rows[0]?.partySize, 1);

  // An uncapped RSVP: a session, no allocation because no pool exists.
  const rsvp = planAdmissions({
    orderLineId: "line-7",
    units: 1,
    admitsPerUnit: 1,
    sessionId: "sess-1",
    allocationId: null,
  });
  assert.ok(rsvp.ok);
  assert.equal(rsvp.rows[0]?.allocationId, null);
});
