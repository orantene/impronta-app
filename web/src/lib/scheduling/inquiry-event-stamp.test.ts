import test from "node:test";
import assert from "node:assert/strict";
import { buildInquiryEventPatch, eventDateForBooking, pickEventZone } from "./inquiry-event-stamp";

test("date is the talent's local date, not the UTC date", () => {
  // 2026-10-08 02:30Z is still Oct 7 in Mexico City (UTC-6).
  assert.equal(eventDateForBooking("2026-10-08T02:30:00Z", "America/Mexico_City"), "2026-10-07");
  assert.equal(eventDateForBooking("2026-10-08T02:30:00Z", "UTC"), "2026-10-08");
  // 23:30Z is already the next day in Tokyo.
  assert.equal(eventDateForBooking("2026-10-07T23:30:00Z", "Asia/Tokyo"), "2026-10-08");
});

test("missing or invalid zone falls back to the next candidate, then UTC", () => {
  assert.equal(pickEventZone(null, "Nope/Zone", "Europe/Madrid"), "Europe/Madrid");
  assert.equal(pickEventZone(undefined, ""), "UTC");
  assert.equal(eventDateForBooking("2026-10-08T02:30:00Z", null, undefined), "2026-10-08");
});

test("patch fills gaps only and never overwrites", () => {
  assert.deepEqual(
    buildInquiryEventPatch({ event_date: null, event_location: "" }, { eventDate: "2026-10-07", location: " Studio " }),
    { event_date: "2026-10-07", event_location: "Studio" },
  );
  assert.deepEqual(
    buildInquiryEventPatch({ event_date: "2026-11-01", event_location: "Home" }, { eventDate: "2026-10-07", location: "Studio" }),
    {},
  );
  assert.deepEqual(buildInquiryEventPatch({ event_date: null }, { eventDate: null, location: null }), {});
});
