import assert from "node:assert/strict";
import { test } from "node:test";

import { computePublicSlots, computePublicSlotStarts } from "./public-slots";
import type { BookingHours } from "./hours-types";

const emptyWeek = () => ({ 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] });

const hours = (over: Partial<BookingHours> = {}): BookingHours => ({
  timezone: "UTC",
  weekly: { ...emptyWeek(), 1: [{ startMin: 540, endMin: 1020 }] },
  exceptions: [],
  slotMinutes: 60,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  minNoticeMin: 0,
  horizonDays: 30,
  ...over,
}) as BookingHours;

// A Monday, so the weekly window above is inside the default range.
const MONDAY = new Date("2027-03-01T00:00:00Z");

test("THE LIVE CASE: no hours row is 'no_booking_hours', not silence", () => {
  const r = computePublicSlots({ hours: null, durationMinutes: 60, from: MONDAY, days: 7 });
  assert.deepEqual(r.starts, []);
  assert.equal(
    r.reason,
    "no_booking_hours",
    "every bookable offering in production is this case; an empty array told nobody",
  );
});

test("a row whose week is closed every day is also 'no_booking_hours'", () => {
  const r = computePublicSlots({
    hours: hours({ weekly: emptyWeek() as BookingHours["weekly"] }),
    durationMinutes: 60,
    from: MONDAY,
    days: 7,
  });
  assert.equal(r.reason, "no_booking_hours");
});

test("a closed week reopened by an exception is NOT reported as unconfigured", () => {
  const r = computePublicSlots({
    hours: hours({
      weekly: emptyWeek() as BookingHours["weekly"],
      exceptions: [{ date: "2027-03-02", closed: false, windows: [{ startMin: 540, endMin: 660 }] }],
    }),
    durationMinutes: 60,
    from: MONDAY,
    days: 7,
  });
  assert.notEqual(
    r.reason,
    "no_booking_hours",
    "telling an operator to set hours they already set is worse than saying nothing",
  );
});

test("open hours outside the window are 'closed_in_window', not 'fully_booked'", () => {
  // Ask for a single Wednesday; the only window is Monday.
  const r = computePublicSlots({
    hours: hours(),
    durationMinutes: 60,
    from: new Date("2027-03-03T00:00:00Z"),
    days: 1,
  });
  assert.deepEqual(r.starts, []);
  assert.equal(r.reason, "closed_in_window");
});

test("open hours fully consumed by busy time are 'fully_booked'", () => {
  const open = computePublicSlots({ hours: hours(), durationMinutes: 60, from: MONDAY, days: 1 });
  assert.ok(open.starts.length > 0, "fixture must produce slots before busy is applied");
  assert.equal(open.reason, null, "a non-empty list carries no reason");

  const r = computePublicSlots({
    hours: hours(),
    durationMinutes: 60,
    from: MONDAY,
    days: 1,
    busy: [{ startsAt: new Date("2027-03-01T00:00:00Z"), endsAt: new Date("2027-03-02T00:00:00Z") }],
  });
  assert.deepEqual(r.starts, []);
  assert.equal(
    r.reason,
    "fully_booked",
    "a booked-out barber and an unconfigured one must not give the same answer",
  );
});

test("the old export is byte-identical, so no caller moved", () => {
  for (const input of [
    { hours: null, durationMinutes: 60, from: MONDAY, days: 7 },
    { hours: hours(), durationMinutes: 60, from: MONDAY, days: 1 },
  ]) {
    assert.deepEqual(computePublicSlotStarts(input), computePublicSlots(input).starts);
  }
});
