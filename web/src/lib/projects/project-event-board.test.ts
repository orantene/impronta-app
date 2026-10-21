import assert from "node:assert/strict";
import test from "node:test";

import { projectEventBoard } from "./project-event-board";
import type { ProjectAssignment } from "./project-record";

const a = (id: string, roleLabel: string | null, talentProfileId: string | null, name = id): ProjectAssignment => ({
  id, talentProfileId, name, roleLabel, pricingUnit: "event", units: 1, talentCostCents: 100, clientChargeCents: 200, currency: "USD",
});
const list = [a("a1", "Waiter", "p1"), a("a2", "Waiter", "p2"), a("a3", "DJ", "p3"), a("a4", null, null, "Typed name")];

test("roles, confirmed and still open are counted from the per-person state", () => {
  const b = projectEventBoard({ assignments: list, startsAt: "2026-11-07T20:00:00Z", confirmations: { ok: true, byAssignment: { a1: "confirmed", a3: "confirmed", a2: "declined" } } });
  const waiter = b.board.roles.find((r) => r.role === "Waiter")!;
  assert.equal(waiter.needed, 2);
  assert.equal(waiter.confirmed, 1);
  assert.equal(waiter.open, 1);
  assert.equal(b.board.roles.find((r) => r.role === "DJ")!.state, "filled");
  assert.equal(b.board.callSheet.length, 2);
  assert.equal(b.stateByAssignment.a2, "declined");
  assert.equal(b.stateByAssignment.a4, "awaiting");
});

test("no state or an unknown read confirms nobody", () => {
  for (const reason of ["no_state", "unknown"] as const) {
    const b = projectEventBoard({ assignments: list, startsAt: null, confirmations: { ok: false, reason } });
    assert.equal(b.board.totals.confirmed, 0);
    assert.equal(b.board.callSheet.length, 0);
    assert.equal(b.stateAvailable, false);
    assert.equal(b.stateByAssignment.a1, "awaiting");
  }
});

test("a role-less seat is grouped under a blank role, and an empty project has no board", () => {
  const b = projectEventBoard({ assignments: [a("x", null, "p9")], startsAt: null, confirmations: { ok: true, byAssignment: {} } });
  assert.equal(b.board.roles.length, 1);
  assert.equal(b.board.complete, false);
  assert.equal(projectEventBoard({ assignments: [], startsAt: null, confirmations: { ok: true, byAssignment: {} } }).board.roles.length, 0);
});
