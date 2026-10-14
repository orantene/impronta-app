import assert from "node:assert/strict";
import test from "node:test";

import { BOOKING_EMAIL_NOTE_MAX, bookingEmailGuestDetails } from "./booking-email-details";

test("notes are clamped to 500 and stripped of control characters", () => {
  const r = bookingEmailGuestDetails({ message: `hola\u0000 ${"x".repeat(900)}` });
  assert.ok(r.guestNote);
  assert.ok(r.guestNote.length <= BOOKING_EMAIL_NOTE_MAX);
  assert.ok(!r.guestNote.includes("\u0000"));
});

test("empty notes and phone come back null", () => {
  assert.deepEqual(bookingEmailGuestDetails({ message: "  ", phone: null }), { guestNote: null, guestPhone: null });
  assert.deepEqual(bookingEmailGuestDetails({}), { guestNote: null, guestPhone: null });
});

test("a valid phone is E.164, an odd one is kept trimmed", () => {
  assert.equal(bookingEmailGuestDetails({ phone: "+52 998 123 4567" }).guestPhone, "+529981234567");
  assert.equal(bookingEmailGuestDetails({ phone: " 12345 " }).guestPhone, "12345");
});

test("markup in a note is left as text for the renderer to escape", () => {
  assert.equal(bookingEmailGuestDetails({ message: "<b>hi</b>" }).guestNote, "<b>hi</b>");
});
