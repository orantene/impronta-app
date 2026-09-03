import test from "node:test";
import assert from "node:assert/strict";
import { minutesToTime, rowToException, rowToWindow, timeToMinutes } from "./rows";

test("Postgres time parses with or without seconds", () => {
  assert.equal(timeToMinutes("19:00:00"), 1140);
  assert.equal(timeToMinutes("19:00"), 1140);
  assert.equal(timeToMinutes("00:00:00"), 0);
  assert.equal(timeToMinutes("23:59:00"), 1439);
});

test("a time that is not a time is null, never zero", () => {
  // 0 is midnight, a real and bookable service start for a club. Collapsing a
  // parse failure to it would open a window nobody set.
  for (const bad of ["", "nonsense", "24:00:00", "19:60", null, undefined, 1140, {}]) {
    assert.equal(timeToMinutes(bad), null, `for ${JSON.stringify(bad)}`);
  }
});

test("minutesToTime round-trips and wraps past midnight", () => {
  assert.equal(minutesToTime(1140), "19:00:00");
  assert.equal(minutesToTime(0), "00:00:00");
  // A window stored as 23:00 + 360 minutes is still a 23:00 window; the wrap is
  // for callers doing clock arithmetic on the label, not on the instant.
  assert.equal(minutesToTime(1500), "01:00:00");
  assert.equal(timeToMinutes(minutesToTime(1140)), 1140);
});

const goodRow = {
  id: "w1",
  venue_id: "v1",
  key: "dinner",
  local_time: "19:00:00",
  duration_minutes: 240,
  weekdays: [1, 2, 3, 4, 5, 6, 7],
  starts_on: "2026-01-01",
  ends_on: null,
  is_active: true,
  seating_step_minutes: 30,
  last_seating_offset_min: null,
  turn_minutes_override: null,
};

test("a complete row becomes a window", () => {
  const w = rowToWindow(goodRow);
  assert.ok(w);
  assert.equal(w.localTimeMin, 1140);
  assert.equal(w.durationMinutes, 240);
  assert.deepEqual(w.weekdays, [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(w.lastSeatingOffsetMin, null, "null must survive as null, not become 0");
});

test("a row that will not parse is DROPPED, never defaulted", () => {
  // A defaulted window is a service at a time nobody chose, which the public
  // page then offers. An absent one is visibly missing from the settings list.
  for (const broken of [
    { ...goodRow, local_time: "nonsense" },
    { ...goodRow, local_time: null },
    { ...goodRow, duration_minutes: null },
    { ...goodRow, duration_minutes: 5 },
    { ...goodRow, weekdays: [] },
    { ...goodRow, weekdays: null },
    { ...goodRow, starts_on: null },
    { ...goodRow, id: null },
  ]) {
    assert.equal(rowToWindow(broken), null, JSON.stringify(broken.local_time ?? broken.weekdays));
  }
});

test("weekdays are cleaned, deduplicated and sorted, and out-of-range values dropped", () => {
  const w = rowToWindow({ ...goodRow, weekdays: [7, 1, 1, 0, 8, 3, "2"] });
  assert.ok(w);
  assert.deepEqual(w.weekdays, [1, 2, 3, 7]);
});

test("an all-invalid weekday array drops the window rather than opening it every day", () => {
  assert.equal(rowToWindow({ ...goodRow, weekdays: [0, 8, 99] }), null);
});

test("a missing seating step falls back to 15, but a valid 0 does not become 15", () => {
  assert.equal(rowToWindow({ ...goodRow, seating_step_minutes: null })!.seatingStepMinutes, 15);
  assert.equal(rowToWindow({ ...goodRow, seating_step_minutes: 3 })!.seatingStepMinutes, 15);
  assert.equal(rowToWindow({ ...goodRow, seating_step_minutes: 20 })!.seatingStepMinutes, 20);
});

test("is_active defaults to true only when absent, and false stays false", () => {
  assert.equal(rowToWindow({ ...goodRow, is_active: false })!.isActive, false);
  assert.equal(rowToWindow({ ...goodRow, is_active: undefined })!.isActive, true);
});

test("an exception keeps a null window_id as a venue-wide statement", () => {
  const e = rowToException({
    venue_id: "v1",
    window_id: null,
    on_date: "2026-12-25",
    is_closed: true,
    local_time: null,
    duration_minutes: null,
    last_seating_offset_min: null,
  });
  assert.ok(e);
  assert.equal(e.windowId, null, "null means the whole venue, and must not become a window id");
  assert.equal(e.isClosed, true);
});

test("an override exception carries its overrides and is not closed", () => {
  const e = rowToException({
    venue_id: "v1",
    window_id: "w1",
    on_date: "2026-12-31",
    is_closed: false,
    local_time: "20:00:00",
    duration_minutes: 360,
    last_seating_offset_min: 180,
  });
  assert.ok(e);
  assert.equal(e.localTimeMin, 1200);
  assert.equal(e.durationMinutes, 360);
  assert.equal(e.lastSeatingOffsetMin, 180);
  assert.equal(e.isClosed, false);
});

test("an exception without a venue or a date is dropped", () => {
  assert.equal(rowToException({ venue_id: null, on_date: "2026-12-25" }), null);
  assert.equal(rowToException({ venue_id: "v1", on_date: null }), null);
});
