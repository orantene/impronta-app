import assert from "node:assert/strict";
import test from "node:test";

import { summariseDateRoster, type RosterRow } from "./date-roster";

const row = (over: Partial<RosterRow>): RosterRow => ({
  admissionId: "a",
  name: "Ana",
  email: null,
  tierLabel: "Adult",
  partySize: 1,
  admittedCount: 0,
  status: "valid",
  ...over,
});

test("counts people per tier and overall; checked in is the admitted count", () => {
  const s = summariseDateRoster([
    row({ admissionId: "1", partySize: 1, admittedCount: 1 }),
    row({ admissionId: "2", name: "Beto", partySize: 1 }),
    row({ admissionId: "3", name: "Cris", tierLabel: "Child", partySize: 2, admittedCount: 1 }),
  ]);
  assert.equal(s.totalPeople, 4);
  assert.equal(s.checkedIn, 2);
  assert.deepEqual(s.byTier, [
    { label: "Adult", people: 2, checkedIn: 1 },
    { label: "Child", people: 2, checkedIn: 1 },
  ]);
});

test("refunded and void tickets are listed but never counted", () => {
  const s = summariseDateRoster([
    row({ admissionId: "1" }),
    row({ admissionId: "2", name: "Dana", status: "refunded" }),
    row({ admissionId: "3", name: "Eli", status: "void" }),
  ]);
  assert.equal(s.totalPeople, 1);
  assert.equal(s.rows.length, 3);
  assert.deepEqual(s.rows.map((r) => r.counted), [true, false, false]);
});

test("checked in never exceeds the people on the ticket", () => {
  const s = summariseDateRoster([row({ partySize: 2, admittedCount: 5 })]);
  assert.equal(s.checkedIn, 2);
});

test("a row with no name or tier stays null (the UI words it); rows sort by name, nameless last", () => {
  const s = summariseDateRoster([row({ admissionId: "1", name: null, tierLabel: null }), row({ admissionId: "2", name: "Ana" })]);
  assert.equal(s.rows[0].name, "Ana");
  assert.equal(s.rows[1].name, null);
  // tiers keep first-seen order; no tier is the empty label (the UI words it)
  assert.deepEqual(s.byTier.map((t) => t.label), ["", "Adult"]);
});

test("empty roster is zeros", () => {
  assert.deepEqual(summariseDateRoster([]), { totalPeople: 0, checkedIn: 0, byTier: [], rows: [] });
});
