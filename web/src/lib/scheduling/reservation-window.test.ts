import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import type { BookingHours } from "./hours-types";
import {
  assertAcceptingNewBookings,
  assertInstantPosture,
  resolveEffectiveBookingMode,
} from "./instant-book-gates";
import { bookingDurationMinutes, validateReservationWindow } from "./reservation-window";
import { generateSlots } from "./slots";

// Mon-Fri 09:00-17:00 UTC, 14-day horizon.
const nine = { startMin: 9 * 60, endMin: 17 * 60 };
const hours: BookingHours = {
  timezone: "UTC",
  weekly: { 0: [], 1: [nine], 2: [nine], 3: [nine], 4: [nine], 5: [nine], 6: [] },
  exceptions: [],
  slotMinutes: 30,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  minNoticeMin: 0,
  horizonDays: 14,
};
// Monday 2026-03-09 08:00Z.
const now = new Date("2026-03-09T08:00:00.000Z");

test("duration: server sum of base + selected extras, 60 when the base is unset", () => {
  const addOns = [
    { id: "a", durationMinutes: 15 },
    { id: "b", durationMinutes: 30 },
    { id: "c", durationMinutes: null },
  ];
  assert.equal(bookingDurationMinutes(60, addOns, ["a", "c"]), 75);
  assert.equal(bookingDurationMinutes(null, addOns, []), 60);
  // An id not on this offering adds nothing.
  assert.equal(bookingDurationMinutes(45, addOns, ["zzz"]), 45);
});

test("bad_duration: a window shorter than the service is refused", () => {
  const r = validateReservationWindow({
    startsAt: "2026-03-10T10:00:00.000Z",
    endsAt: "2026-03-10T10:10:00.000Z",
    expectedDurationMin: 90,
    hours,
    now,
  });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, "bad_duration");
});

test("bad_duration is checked even when the talent has no hours row", () => {
  const r = validateReservationWindow({
    startsAt: "2026-03-10T10:00:00.000Z",
    endsAt: "2026-03-10T12:00:00.000Z",
    expectedDurationMin: 60,
    hours: null,
    now,
  });
  assert.equal(!r.ok && r.reason, "bad_duration");
});

test("beyond_horizon: a start past horizon_days is refused", () => {
  const r = validateReservationWindow({
    startsAt: "2026-03-24T10:00:00.000Z", // day index 15
    endsAt: "2026-03-24T11:00:00.000Z",
    expectedDurationMin: 60,
    hours,
    now,
  });
  assert.equal(!r.ok && r.reason, "beyond_horizon");
});

test("outside_hours: a closed day, a start before open, and an end past close", () => {
  const cases = [
    ["2026-03-15T10:00:00.000Z", "2026-03-15T11:00:00.000Z"], // Sunday
    ["2026-03-10T08:00:00.000Z", "2026-03-10T09:00:00.000Z"], // before 09:00
    ["2026-03-10T16:30:00.000Z", "2026-03-10T17:30:00.000Z"], // runs past 17:00
  ];
  for (const [startsAt, endsAt] of cases) {
    const r = validateReservationWindow({ startsAt, endsAt, expectedDurationMin: 60, hours, now });
    assert.equal(!r.ok && r.reason, "outside_hours", startsAt);
  }
});

test("outside_hours respects a closed exception day", () => {
  const closed: BookingHours = { ...hours, exceptions: [{ date: "2026-03-10", closed: true, windows: [] }] };
  const r = validateReservationWindow({
    startsAt: "2026-03-10T10:00:00.000Z",
    endsAt: "2026-03-10T11:00:00.000Z",
    expectedDurationMin: 60,
    hours: closed,
    now,
  });
  assert.equal(!r.ok && r.reason, "outside_hours");
});

test("every slot the generator offers passes the re-check (same rule)", () => {
  const slots = generateSlots({ hours, durationMinutes: 75, from: now });
  assert.ok(slots.length > 50);
  for (const s of slots) {
    const r = validateReservationWindow({
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      expectedDurationMin: 75,
      hours,
      now,
    });
    assert.equal(r.ok, true, s.startsAt.toISOString());
  }
});

test("slots in a non-UTC zone pass too", () => {
  const mx: BookingHours = { ...hours, timezone: "America/Mexico_City" };
  const slots = generateSlots({ hours: mx, durationMinutes: 60, from: now });
  assert.ok(slots.length > 0);
  for (const s of slots) {
    const r = validateReservationWindow({
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      expectedDurationMin: 60,
      hours: mx,
      now,
    });
    assert.equal(r.ok, true, s.startsAt.toISOString());
  }
});

test("effective mode: default inquiry + offering instant override is allowed", () => {
  const m = resolveEffectiveBookingMode({ offering: { bookingMode: "instant" }, defaults: { bookingPosture: "inquiry" } });
  assert.deepEqual(m, { mode: "instant", source: "offering" });
  assert.equal(assertInstantPosture({ sellingDefaults: { bookingPosture: "inquiry" }, bookingMode: "instant", staffDesk: false }).ok, true);
});

test("effective mode: default instant (on_demand) + offering request is refused request_only", () => {
  const g = assertInstantPosture({ sellingDefaults: { bookingPosture: "on_demand" }, bookingMode: "request", staffDesk: false });
  assert.equal(!g.ok && g.reason, "request_only");
});

test("effective mode (WSF-B): explicit request wins over default inquiry; inherited (null) follows it", () => {
  const m = resolveEffectiveBookingMode({ offering: { bookingMode: "request" }, defaults: { bookingPosture: "inquiry" } });
  assert.deepEqual(m, { mode: "request", source: "offering" });
  const g = assertInstantPosture({ sellingDefaults: { bookingPosture: "inquiry" }, bookingMode: "request", staffDesk: false });
  assert.equal(!g.ok && g.reason, "request_only");
  const inh = assertInstantPosture({ sellingDefaults: { bookingPosture: "inquiry" }, bookingMode: null, staffDesk: false });
  assert.equal(!inh.ok && inh.reason, "inquiry_only");
});

test("effective mode: master restriction closes everything; hook is open today; till exempt", () => {
  assert.equal(assertAcceptingNewBookings().ok, true);
  assert.equal(resolveEffectiveBookingMode({ offering: { bookingMode: "instant" }, defaults: {}, accepting: false }).mode, "closed");
  assert.equal(assertInstantPosture({ sellingDefaults: {}, bookingMode: "instant", staffDesk: false, accepting: false }).ok, false);
  assert.equal(assertInstantPosture({ sellingDefaults: { bookingPosture: "inquiry" }, bookingMode: "request", staffDesk: true }).ok, true);
  assert.equal(assertInstantPosture({ sellingDefaults: { bookingPosture: "on_demand" }, bookingMode: "instant", staffDesk: false }).ok, true);
});

test("placeInstantPurchase runs posture, window and effective policy before createPurchase", () => {
  const src = readFileSync(join(__dirname, "instant-purchase.ts"), "utf8");
  const create = src.indexOf("return createPurchase(");
  for (const needle of ["assertInstantPosture(", "validateReservationWindow(", "resolveOfferingPolicy("]) {
    const at = src.indexOf(needle);
    assert.ok(at > 0 && at < create, needle);
  }
  assert.match(src, /instantBookPaymentChoice\(input\.payInPerson, effective\.reserveMode\)/);
});
