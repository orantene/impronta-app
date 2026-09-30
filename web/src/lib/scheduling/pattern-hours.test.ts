/**
 * F27: the drawer availability pattern and bookable hours are one thing.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { WeeklyHours } from "./hours-types";
import {
  PATTERN_DEFAULT_WINDOW,
  openDaysForPattern,
  openDaysOfWeekly,
  patternFromWeekly,
  recurringChanged,
  recurringFromAvailabilityData,
  sameWeekly,
  weeklyFromAvailabilityPattern,
} from "./pattern-hours";

const empty = (): WeeklyHours => ({ 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] });

test("Weekdays only opens Mon-Fri with the default window (a new talent gets bookable hours)", () => {
  const weekly = weeklyFromAvailabilityPattern({ kind: "weekdays-only" }, null)!;
  assert.deepEqual(openDaysOfWeekly(weekly), [1, 2, 3, 4, 5]);
  assert.deepEqual(weekly[1], [PATTERN_DEFAULT_WINDOW]);
  assert.deepEqual(weekly[0], []);
  assert.deepEqual(weekly[6], []);
});

test("a day the pattern keeps open keeps its saved window; a closed day is emptied", () => {
  const saved = empty();
  saved[2] = [{ startMin: 8 * 60, endMin: 12 * 60 }];
  saved[6] = [{ startMin: 9 * 60, endMin: 14 * 60 }];
  const weekly = weeklyFromAvailabilityPattern({ kind: "weekdays-only" }, saved)!;
  assert.deepEqual(weekly[2], [{ startMin: 480, endMin: 720 }]);
  assert.deepEqual(weekly[6], []);
});

test("weekends-only and weekly-busy map to their days; none says nothing", () => {
  assert.deepEqual(openDaysForPattern({ kind: "weekends-only" }), [0, 6]);
  assert.deepEqual(openDaysForPattern({ kind: "weekly-busy", busyDays: [0, 1] }), [2, 3, 4, 5, 6]);
  assert.equal(openDaysForPattern({ kind: "none" }), null);
  assert.equal(openDaysForPattern(null), null);
  assert.equal(weeklyFromAvailabilityPattern({ kind: "none" }, empty()), null);
});

test("saved hours write the matching pattern back, or none when no pattern fits", () => {
  const w = weeklyFromAvailabilityPattern({ kind: "weekdays-only" }, null)!;
  assert.deepEqual(patternFromWeekly(w), { kind: "weekdays-only" });
  assert.deepEqual(patternFromWeekly(weeklyFromAvailabilityPattern({ kind: "weekends-only" }, null)), {
    kind: "weekends-only",
  });
  const monSat = weeklyFromAvailabilityPattern({ kind: "weekly-busy", busyDays: [0] }, null)!;
  assert.equal(patternFromWeekly(monSat), null);
});

test("only a changed pattern may rewrite hours", () => {
  assert.equal(recurringChanged({ kind: "weekdays-only" }, { kind: "weekdays-only" }), false);
  assert.equal(recurringChanged(null, { kind: "none" }), false);
  assert.equal(recurringChanged({ kind: "none" }, { kind: "weekdays-only" }), true);
  assert.equal(recurringChanged({ kind: "weekly-busy", busyDays: [1] }, { kind: "weekly-busy", busyDays: [2] }), true);
});

test("reads the pattern out of availability_data and compares weeks", () => {
  assert.deepEqual(recurringFromAvailabilityData({ cells: [], recurring: { kind: "weekdays-only" } }), {
    kind: "weekdays-only",
  });
  assert.equal(recurringFromAvailabilityData(null), null);
  const a = weeklyFromAvailabilityPattern({ kind: "weekdays-only" }, null);
  assert.equal(sameWeekly(a, weeklyFromAvailabilityPattern({ kind: "weekdays-only" }, null)), true);
  assert.equal(sameWeekly(a, weeklyFromAvailabilityPattern({ kind: "weekends-only" }, null)), false);
});
