/**
 * DST / buffer / notice / horizon coverage for lib/scheduling.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { generateSlots } from "./slots";
import { parseBookingHours, parseWeeklyHours } from "./hours-types";
import { zonedLocalToUtc, isValidIanaTimeZone, utcToZonedYmd } from "./tz";
import type { BookingHours } from "./hours-types";

function hours(partial: Partial<BookingHours> & Pick<BookingHours, "timezone" | "weekly">): BookingHours {
  return {
    exceptions: [],
    slotMinutes: 30,
    bufferBeforeMin: 0,
    bufferAfterMin: 0,
    minNoticeMin: 0,
    horizonDays: 7,
    ...partial,
  };
}

test("Cancun 10:00 is a UTC instant, not a civil string", () => {
  const instant = zonedLocalToUtc("2026-03-10", 10 * 60, "America/Cancun");
  assert.ok(instant);
  // Cancun is UTC-5 year-round.
  assert.equal(instant.toISOString(), "2026-03-10T15:00:00.000Z");
  assert.equal(utcToZonedYmd(instant, "America/Cancun"), "2026-03-10");
});

test("spring-forward gap in America/New_York is skipped (nonexistent 02:30)", () => {
  // 2026-03-08: 02:00 EST → 03:00 EDT. 02:30 never happens.
  assert.equal(zonedLocalToUtc("2026-03-08", 2 * 60 + 30, "America/New_York"), null);
  const three = zonedLocalToUtc("2026-03-08", 3 * 60, "America/New_York");
  assert.ok(three);
  assert.equal(three.toISOString(), "2026-03-08T07:00:00.000Z");
});

test("fall-back overlap in America/New_York uses the first occurrence", () => {
  // 2026-11-01: 02:00 EDT → 01:00 EST. 01:30 happens twice; take the earlier (EDT, UTC-4).
  const first = zonedLocalToUtc("2026-11-01", 1 * 60 + 30, "America/New_York");
  assert.ok(first);
  assert.equal(first.toISOString(), "2026-11-01T05:30:00.000Z");
});

test("garbage timezone is rejected", () => {
  assert.equal(isValidIanaTimeZone("Not/AZone"), false);
  assert.equal(zonedLocalToUtc("2026-03-10", 600, "Not/AZone"), null);
});

test("garbage weekly jsonb fails closed (null, not empty guess)", () => {
  assert.equal(parseWeeklyHours("monday 9-5"), null);
  assert.equal(parseWeeklyHours({ 1: [{ startMin: 9, endMin: 5 }] }), null);
  assert.equal(parseBookingHours({ timezone: "UTC", weekly: "nope" }), null);
});

test("durationMinutes is load-bearing: a 60-min service on a 30-min grid", () => {
  const h = hours({
    timezone: "UTC",
    weekly: {
      0: [],
      1: [{ startMin: 10 * 60, endMin: 12 * 60 }],
      2: [],
      3: [],
      4: [],
      5: [],
      6: [],
    },
    horizonDays: 1,
  });
  // 2026-03-09 is a Monday.
  const from = new Date("2026-03-09T00:00:00.000Z");
  const slots = generateSlots({ hours: h, durationMinutes: 60, from });
  assert.deepEqual(
    slots.map((s) => s.startsAt.toISOString()),
    ["2026-03-09T10:00:00.000Z", "2026-03-09T10:30:00.000Z", "2026-03-09T11:00:00.000Z"],
  );
  assert.equal(slots[0]?.endsAt.toISOString(), "2026-03-09T11:00:00.000Z");
  // 11:30 would end at 12:30, past the window.
  assert.equal(slots.at(-1)?.startsAt.toISOString(), "2026-03-09T11:00:00.000Z");
});

test("buffer after a busy block hides the next grid start", () => {
  const h = hours({
    timezone: "UTC",
    weekly: {
      0: [],
      1: [{ startMin: 10 * 60, endMin: 12 * 60 }],
      2: [],
      3: [],
      4: [],
      5: [],
      6: [],
    },
    bufferAfterMin: 15,
    horizonDays: 1,
  });
  const from = new Date("2026-03-09T00:00:00.000Z");
  const slots = generateSlots({
    hours: h,
    durationMinutes: 30,
    from,
    busy: [
      {
        startsAt: new Date("2026-03-09T10:00:00.000Z"),
        endsAt: new Date("2026-03-09T10:30:00.000Z"),
      },
    ],
  });
  assert.equal(slots[0]?.startsAt.toISOString(), "2026-03-09T11:00:00.000Z");
});

test("min-notice drops slots that start too soon", () => {
  const h = hours({
    timezone: "UTC",
    weekly: {
      0: [],
      1: [{ startMin: 10 * 60, endMin: 14 * 60 }],
      2: [],
      3: [],
      4: [],
      5: [],
      6: [],
    },
    minNoticeMin: 120,
    horizonDays: 1,
  });
  const from = new Date("2026-03-09T10:00:00.000Z");
  const slots = generateSlots({ hours: h, durationMinutes: 30, from });
  assert.equal(slots[0]?.startsAt.toISOString(), "2026-03-09T12:00:00.000Z");
});

test("horizon_days caps how far ahead slots are generated", () => {
  const h = hours({
    timezone: "UTC",
    weekly: {
      0: [{ startMin: 10 * 60, endMin: 11 * 60 }],
      1: [{ startMin: 10 * 60, endMin: 11 * 60 }],
      2: [{ startMin: 10 * 60, endMin: 11 * 60 }],
      3: [{ startMin: 10 * 60, endMin: 11 * 60 }],
      4: [{ startMin: 10 * 60, endMin: 11 * 60 }],
      5: [{ startMin: 10 * 60, endMin: 11 * 60 }],
      6: [{ startMin: 10 * 60, endMin: 11 * 60 }],
    },
    horizonDays: 2,
  });
  const from = new Date("2026-03-09T00:00:00.000Z");
  const slots = generateSlots({ hours: h, durationMinutes: 60, from });
  const days = new Set(slots.map((s) => s.startsAt.toISOString().slice(0, 10)));
  assert.deepEqual([...days].sort(), ["2026-03-09", "2026-03-10"]);
});

test("DST gap day still yields later valid slots and never invents 02:30", () => {
  const h = hours({
    timezone: "America/New_York",
    weekly: {
      0: [{ startMin: 1 * 60, endMin: 4 * 60 }],
      1: [],
      2: [],
      3: [],
      4: [],
      5: [],
      6: [],
    },
    slotMinutes: 30,
    horizonDays: 1,
  });
  const from = zonedLocalToUtc("2026-03-08", 0, "America/New_York");
  assert.ok(from);
  const slots = generateSlots({ hours: h, durationMinutes: 30, from });
  const isos = slots.map((s) => s.startsAt.toISOString());
  assert.ok(isos.includes("2026-03-08T06:00:00.000Z")); // 01:00 EST
  assert.ok(isos.includes("2026-03-08T07:00:00.000Z")); // 03:00 EDT
  assert.ok(!isos.includes("2026-03-08T06:45:00.000Z"));
  assert.equal(zonedLocalToUtc("2026-03-08", 2 * 60 + 30, "America/New_York"), null);
});
