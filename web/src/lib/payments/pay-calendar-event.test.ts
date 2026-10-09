/**
 * TUL-437: dated booking → calendar event (or null). Run:
 * node_modules/.bin/tsx --test src/lib/payments/pay-calendar-event.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { payCalendarEvent } from "./pay-calendar-event";

test("a dated booking becomes a calendar event with location and seller in the title", () => {
  const ev = payCalendarEvent({
    uid: "bk-1",
    startsAt: "2026-10-09T22:30:00.000Z",
    endsAt: "2026-10-09T23:30:00.000Z",
    title: "QA paid test",
    locationText: "Calle 1; Tulum",
    sellerName: "Rosa",
    description: "Pagado a Rosa",
  });
  assert.deepEqual(ev, {
    uid: "bk-1",
    title: "QA paid test, Rosa",
    startsAt: "2026-10-09T22:30:00.000Z",
    endsAt: "2026-10-09T23:30:00.000Z",
    location: "Calle 1; Tulum",
    description: "Pagado a Rosa",
  });
});

test("missing end defaults to one hour; missing start yields null", () => {
  assert.equal(payCalendarEvent({ uid: "x", startsAt: null }), null);
  assert.equal(payCalendarEvent({ uid: "x", startsAt: "nope" }), null);
  const ev = payCalendarEvent({ uid: "x", startsAt: "2026-10-09T22:30:00.000Z", title: "Cut" });
  assert.equal(ev?.endsAt, "2026-10-09T23:30:00.000Z");
});

test("location prefers the booking's own line over the inquiry / venue", () => {
  const ev = payCalendarEvent({
    uid: "x",
    startsAt: "2026-10-09T22:30:00.000Z",
    locationText: "Studio A",
    requestedLocation: "Home",
    venueLocationText: "Venue",
  });
  assert.equal(ev?.location, "Studio A");
});
