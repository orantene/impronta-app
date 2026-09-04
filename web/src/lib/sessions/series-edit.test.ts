/**
 * UNIT TEST — series-edit.ts.
 *
 * Runs in `test:sessions` (glob lane, no package.json edit).
 * Run: cd web && npm run test:sessions
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  planNeedsConfirmation,
  planSeriesEdit,
  type ExistingSession,
  type PlannedOccurrence,
} from "./series-edit";

const NOW = new Date("2027-06-01T00:00:00Z");

function occ(iso: string): PlannedOccurrence {
  return {
    startsAt: iso,
    endsAt: new Date(Date.parse(iso) + 3_600_000).toISOString(),
    localDate: iso.slice(0, 10),
  };
}

function stored(
  id: string,
  iso: string,
  over: Partial<ExistingSession> = {},
): ExistingSession {
  return { id, startsAt: iso, hasAdmissions: false, status: "scheduled", ...over };
}

// ── The past is a fact ─────────────────────────────────────────────────────

test("past occurrences are untouched, never moved and never cancelled", () => {
  const plan = planSeriesEdit(
    [occ("2027-06-08T17:00:00.000Z")],
    [stored("old", "2027-05-04T16:00:00.000Z"), stored("older", "2027-01-05T16:00:00.000Z")],
    "all_future",
    NOW,
  );
  assert.equal(plan.untouched.length, 2);
  assert.equal(plan.rescheduled.length, 0);
  assert.equal(plan.removed.length, 0);
});

test("an occurrence exactly at `now` counts as FUTURE", () => {
  // A class starting this second has not happened. Treating it as past would
  // quietly exclude it from an edit the operator expects to include.
  const plan = planSeriesEdit(
    [occ("2027-06-08T17:00:00.000Z")],
    [stored("s", NOW.toISOString())],
    "all_future",
    NOW,
  );
  assert.equal(plan.untouched.length, 0);
  assert.equal(plan.rescheduled.length, 1);
});

// ── A sold seat is not moved ───────────────────────────────────────────────

test("a future occurrence WITH admissions is protected, not rescheduled", () => {
  const plan = planSeriesEdit(
    [occ("2027-06-08T18:00:00.000Z")],
    [stored("sold", "2027-06-08T17:00:00.000Z", { hasAdmissions: true })],
    "all_future",
    NOW,
  );
  assert.equal(plan.protected.length, 1);
  assert.equal(plan.protected[0]!.id, "sold");
  assert.equal(plan.rescheduled.length, 0);
  // And the instant the new shape wanted is still offered, as an addition.
  assert.equal(plan.added.length, 1);
});

test("a sold occurrence the new shape drops is protected, NOT removed", () => {
  // The dangerous direction: cancelling a class somebody bought a seat for
  // because a weekday came off the series.
  const plan = planSeriesEdit(
    [],
    [stored("sold", "2027-06-08T17:00:00.000Z", { hasAdmissions: true })],
    "all_future",
    NOW,
  );
  assert.equal(plan.removed.length, 0, "cancelled a class somebody holds a seat at");
  assert.equal(plan.protected.length, 1);
});

test("an unsold occurrence the new shape drops is removed", () => {
  const plan = planSeriesEdit(
    [],
    [stored("empty", "2027-06-08T17:00:00.000Z")],
    "all_future",
    NOW,
  );
  assert.equal(plan.removed.length, 1);
  assert.equal(plan.protected.length, 0);
});

// ── Scope ──────────────────────────────────────────────────────────────────

test("'this one' touches exactly one occurrence and leaves the rest alone", () => {
  const rows = [
    stored("a", "2027-06-08T17:00:00.000Z"),
    stored("b", "2027-06-15T17:00:00.000Z"),
    stored("c", "2027-06-22T17:00:00.000Z"),
  ];
  const plan = planSeriesEdit(
    [occ("2027-06-15T18:00:00.000Z")],
    rows,
    "this_one",
    NOW,
    "2027-06-15T17:00:00.000Z",
  );
  assert.equal(plan.rescheduled.length, 1);
  assert.equal(plan.rescheduled[0]!.session.id, "b");
  assert.equal(plan.untouched.length, 2);
  assert.equal(plan.removed.length, 0);
});

test("'this one' with no occurrence named refuses rather than widening", () => {
  // The dangerous default: a "this one" edit that quietly becomes "all future"
  // rewrites a schedule the operator never agreed to change.
  const rows = [stored("a", "2027-06-08T17:00:00.000Z"), stored("b", "2027-06-15T17:00:00.000Z")];
  const plan = planSeriesEdit([occ("2027-06-08T18:00:00.000Z")], rows, "this_one", NOW);
  assert.equal(plan.rescheduled.length, 0);
  assert.equal(plan.removed.length, 0);
  assert.equal(plan.added.length, 0);
  assert.equal(plan.untouched.length, 0);
});

test("'this one' naming an unparseable instant refuses too", () => {
  const plan = planSeriesEdit(
    [occ("2027-06-08T18:00:00.000Z")],
    [stored("a", "2027-06-08T17:00:00.000Z")],
    "this_one",
    NOW,
    "not-a-date",
  );
  assert.equal(plan.rescheduled.length, 0);
  assert.equal(plan.added.length, 0);
});

// ── Matching ───────────────────────────────────────────────────────────────

test("an occurrence already on a produced instant is neither moved nor re-added", () => {
  const plan = planSeriesEdit(
    [occ("2027-06-08T17:00:00.000Z"), occ("2027-06-15T17:00:00.000Z")],
    [stored("a", "2027-06-08T17:00:00.000Z")],
    "all_future",
    NOW,
  );
  assert.equal(plan.rescheduled.length, 0);
  assert.equal(plan.added.length, 1);
  assert.equal(plan.added[0]!.startsAt, "2027-06-15T17:00:00.000Z");
});

test("matching is on the INSTANT, not the string", () => {
  const plan = planSeriesEdit(
    [occ("2027-06-08T17:00:00.000Z")],
    [stored("a", "2027-06-08T17:00:00.000+00:00")],
    "all_future",
    NOW,
  );
  assert.equal(plan.rescheduled.length, 0, "the same instant spelled twice looked like a move");
  assert.equal(plan.added.length, 0);
});

test("moves are assigned in time order, so the preview is the plan that runs", () => {
  const rows = [
    stored("late", "2027-06-22T17:00:00.000Z"),
    stored("early", "2027-06-08T17:00:00.000Z"),
  ];
  const plan = planSeriesEdit(
    [occ("2027-06-08T18:00:00.000Z"), occ("2027-06-22T18:00:00.000Z")],
    rows,
    "all_future",
    NOW,
  );
  assert.equal(plan.rescheduled.length, 2);
  assert.equal(plan.rescheduled[0]!.session.id, "early");
  assert.equal(plan.rescheduled[0]!.to.startsAt, "2027-06-08T18:00:00.000Z");
  assert.equal(plan.rescheduled[1]!.session.id, "late");
});

test("an already-cancelled occurrence is left entirely alone", () => {
  // Reviving one by accident is worse than ignoring it.
  const plan = planSeriesEdit(
    [occ("2027-06-08T18:00:00.000Z")],
    [stored("dead", "2027-06-08T17:00:00.000Z", { status: "cancelled" })],
    "all_future",
    NOW,
  );
  assert.equal(plan.rescheduled.length, 0);
  assert.equal(plan.removed.length, 0);
  assert.equal(plan.untouched.length, 0);
  assert.equal(plan.added.length, 1);
});

// ── Confirmation ───────────────────────────────────────────────────────────

test("an add-only edit needs no confirmation; a move or a cancel does", () => {
  // A confirmation people see on every save is one they stop reading.
  const addOnly = planSeriesEdit([occ("2027-06-08T17:00:00.000Z")], [], "all_future", NOW);
  assert.equal(planNeedsConfirmation(addOnly), false);

  const moves = planSeriesEdit(
    [occ("2027-06-08T18:00:00.000Z")],
    [stored("a", "2027-06-08T17:00:00.000Z")],
    "all_future",
    NOW,
  );
  assert.equal(planNeedsConfirmation(moves), true);

  const protects = planSeriesEdit(
    [],
    [stored("sold", "2027-06-08T17:00:00.000Z", { hasAdmissions: true })],
    "all_future",
    NOW,
  );
  assert.equal(planNeedsConfirmation(protects), true);
});
