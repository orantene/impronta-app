import { test } from "node:test";
import assert from "node:assert/strict";

import { parseBookingHours } from "@/lib/scheduling/hours-types";
import { pickCallout, EMPTY_CALLOUT_STATE } from "./engine";
import { buildUpcomingDays, countLapsedClients, pickCancellation, promoCoversDay, serviceBookingCounts } from "./inputs";
import type { Promo } from "../types";

const weekdayWindow = [{ startMin: 600, endMin: 960 }]; // 10:00-16:00
const hours = parseBookingHours({
  timezone: "UTC",
  weekly: { 0: [], 1: weekdayWindow, 2: weekdayWindow, 3: weekdayWindow, 4: weekdayWindow, 5: weekdayWindow, 6: [] },
  exceptions: [],
})!;
// Wed 2026-10-14 08:00Z
const NOW = new Date("2026-10-14T08:00:00Z");

test("upcoming days skip closed days and count booked hours inside working windows", () => {
  const days = buildUpcomingDays({
    now: NOW,
    hours,
    busy: [
      { starts_at: "2026-10-14T10:00:00Z", ends_at: "2026-10-14T12:00:00Z", status: "confirmed" },
      { starts_at: "2026-10-15T10:00:00Z", ends_at: "2026-10-15T16:00:00Z", status: "cancelled" },
    ],
    promos: [],
  });
  assert.equal(days.length, 5); // Wed Thu Fri Mon Tue (weekend closed)
  assert.deepEqual([days[0]!.openHours, days[0]!.bookedHours], [6, 2]);
  assert.deepEqual([days[1]!.openHours, days[1]!.bookedHours], [6, 0]); // cancelled ignored
  assert.match(days[0]!.label, /^Miércoles 14$/);
});

test("today only counts time still ahead", () => {
  const days = buildUpcomingDays({ now: new Date("2026-10-14T13:00:00Z"), hours, busy: [], promos: [] });
  assert.equal(days[0]!.openHours, 3);
});

test("a live promo on that weekday marks the day covered", () => {
  const p = { id: "p", tz: "UTC", weekdays: [4] } as unknown as Promo;
  assert.equal(promoCoversDay(p, "2026-10-15", 4), true);
  assert.equal(promoCoversDay(p, "2026-10-14", 3), false);
  assert.equal(promoCoversDay({ ...p, is_paused: true } as Promo, "2026-10-15", 4), false);
  assert.equal(promoCoversDay({ ...p, ends_at: "2026-10-10" } as Promo, "2026-10-15", 4), false);
});

test("empty days feed pickCallout end to end", () => {
  const days = buildUpcomingDays({ now: NOW, hours, busy: [], promos: [] });
  const c = pickCallout({ now: NOW, state: EMPTY_CALLOUT_STATE, upcomingDays: days, hasAvailability: true, pastBookings: 5 });
  assert.equal(c?.type, "empty_days");
});

test("cancellation: fresh, 3h+ away, inside working hours", () => {
  const rows = [
    { starts_at: "2026-10-15T11:00:00Z", ends_at: "2026-10-15T12:00:00Z", status: "cancelled", updated_at: "2026-10-14T06:00:00Z" },
    { starts_at: "2026-10-15T11:00:00Z", ends_at: "2026-10-15T12:00:00Z", status: "cancelled", updated_at: "2026-10-10T06:00:00Z" },
  ];
  const c = pickCancellation({ now: NOW, hours, rows });
  assert.deepEqual([c?.slotLabel, c?.withinWorkingHours], ["11:00", true]);
  assert.ok((c?.hoursAway ?? 0) >= 3);
  assert.equal(pickCancellation({ now: NOW, hours, rows: [rows[1]!] }), null);
  const night = pickCancellation({ now: NOW, hours, rows: [{ ...rows[0]!, starts_at: "2026-10-15T20:00:00Z", ends_at: "2026-10-15T21:00:00Z" }] });
  assert.equal(night?.withinWorkingHours, false);
});

test("lapsed clients: 2+ orders, none in 90 days", () => {
  const n = new Date("2026-10-14T00:00:00Z");
  const o = (c: string | null, d: string) => ({ customer_id: c, created_at: d });
  assert.equal(
    countLapsedClients(
      [o("a", "2026-03-01T00:00:00Z"), o("a", "2026-04-01T00:00:00Z"), o("b", "2026-03-01T00:00:00Z"), o("c", "2026-03-01T00:00:00Z"), o("c", "2026-10-01T00:00:00Z"), o(null, "2026-01-01T00:00:00Z"), o(null, "2026-01-02T00:00:00Z")],
      n,
    ),
    1,
  );
});

test("service booking counts include zero-booking services", () => {
  const r = serviceBookingCounts([{ id: "s1", title: "Corte" }, { id: "s2", title: "Tinte" }], [{ offering_id: "s1" }, { offering_id: "s1" }, { offering_id: null }]);
  assert.deepEqual(r, [{ id: "s1", name: "Corte", bookings30d: 2 }, { id: "s2", name: "Tinte", bookings30d: 0 }]);
});
