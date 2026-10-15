import { test } from "node:test";
import assert from "node:assert/strict";

import { applyCalloutAction, EMPTY_CALLOUT_STATE, pickCallout, recordShown, type CalloutInputs } from "./engine";
import { calloutText } from "./copy";

const NOW = "2026-10-14T15:00:00Z";
const emptyDays = [
  { label: "Martes 15", openHours: 6, bookedHours: 0, coveredByLivePromo: false },
  { label: "Miércoles 16", openHours: 6, bookedHours: 1, coveredByLivePromo: false },
  { label: "Jueves 17", openHours: 6, bookedHours: 2, coveredByLivePromo: false },
];
function inp(over: Partial<CalloutInputs> = {}): CalloutInputs {
  return { now: NOW, state: EMPTY_CALLOUT_STATE, hasAvailability: true, pastBookings: 5, upcomingDays: emptyDays, ...over };
}

test("empty days fires on real data and quotes it", () => {
  const c = pickCallout(inp());
  assert.deepEqual(c, { type: "empty_days", dayLabel: "Martes 15", booked: 0, open: 6 });
  assert.equal(calloutText(c!, "es").title, "Martes 15: 0 de 6 horas reservadas");
});

test("empty days needs availability, 3 past bookings, under 30%, and no live promo", () => {
  assert.equal(pickCallout(inp({ hasAvailability: false })), null);
  assert.equal(pickCallout(inp({ pastBookings: 2 })), null);
  assert.equal(pickCallout(inp({ upcomingDays: emptyDays.map((d) => ({ ...d, bookedHours: 3 })) })), null);
  assert.equal(pickCallout(inp({ upcomingDays: emptyDays.map((d, i) => ({ ...d, coveredByLivePromo: i === 1 })) })), null);
});

test("cancellation beats empty days; needs 3h+ and working hours", () => {
  const c = pickCallout(inp({ cancellation: { slotLabel: "4 PM", hoursAway: 5, withinWorkingHours: true } }));
  assert.equal(c?.type, "cancellation");
  assert.equal(pickCallout(inp({ cancellation: { slotLabel: "4 PM", hoursAway: 2, withinWorkingHours: true } }))?.type, "empty_days");
  assert.equal(pickCallout(inp({ cancellation: { slotLabel: "4 PM", hoursAway: 47, withinWorkingHours: false } }))?.type, "empty_days");
});

test("lapsed then idle service ordering, and idle needs other services booked", () => {
  const base = inp({ upcomingDays: [], lapsedClients: 3, services: [{ id: "s1", name: "Acrílicas", bookings30d: 0 }, { id: "s2", name: "Gel", bookings30d: 4 }] });
  assert.equal(pickCallout(base)?.type, "lapsed_clients");
  assert.equal(pickCallout({ ...base, lapsedClients: 0 })?.type, "idle_service");
  assert.equal(pickCallout({ ...base, lapsedClients: 0, services: [{ id: "s1", name: "A", bookings30d: 0 }] }), null);
});

test("max one per day, three per week", () => {
  const day = recordShown(EMPTY_CALLOUT_STATE, "2026-10-14T09:00:00Z");
  assert.equal(pickCallout(inp({ state: day })), null);
  const week = ["2026-10-09T09:00:00Z", "2026-10-11T09:00:00Z", "2026-10-12T09:00:00Z"];
  assert.equal(pickCallout(inp({ state: { types: {}, shown: week } })), null);
  assert.equal(pickCallout(inp({ state: { types: {}, shown: week.slice(0, 2) } }))?.type, "empty_days");
});

test("snooze 7 days, hide forever, auto-quiet after 3 in a row, accept resets", () => {
  let s = applyCalloutAction(EMPTY_CALLOUT_STATE, "empty_days", "snooze", NOW);
  assert.equal(pickCallout(inp({ state: s })), null);
  assert.equal(pickCallout(inp({ state: s, now: "2026-10-22T15:00:00Z" }))?.type, "empty_days");
  s = applyCalloutAction(s, "empty_days", "snooze", "2026-10-22T15:00:00Z");
  s = applyCalloutAction(s, "empty_days", "snooze", "2026-10-30T15:00:00Z");
  // Third in a row: quiet 30 days, so day 8 after the last snooze is still silent.
  assert.equal(pickCallout(inp({ state: s, now: "2026-11-08T15:00:00Z" })), null);
  assert.equal(pickCallout(inp({ state: s, now: "2026-12-01T15:00:00Z" }))?.type, "empty_days");

  const h = applyCalloutAction(EMPTY_CALLOUT_STATE, "empty_days", "hide", NOW);
  assert.equal(pickCallout(inp({ state: h, now: "2027-06-01T00:00:00Z" })), null);
  assert.equal(pickCallout(inp({ state: applyCalloutAction(h, "empty_days", "unhide", NOW) }))?.type, "empty_days");

  const two = applyCalloutAction(applyCalloutAction(EMPTY_CALLOUT_STATE, "empty_days", "snooze", NOW), "empty_days", "snooze", NOW);
  assert.equal(applyCalloutAction(two, "empty_days", "accept", NOW).types.empty_days?.consecutiveDismissals, 0);
});

test("a hidden type does not block a lower-priority one", () => {
  const h = applyCalloutAction(EMPTY_CALLOUT_STATE, "empty_days", "hide", NOW);
  assert.equal(pickCallout(inp({ state: h, lapsedClients: 2 }))?.type, "lapsed_clients");
});
