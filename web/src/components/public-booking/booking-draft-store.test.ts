import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import {
  bookingDraftKey,
  clearBookingDraft,
  loadBookingDraft,
  saveBookingDraft,
  type BookingDraft,
} from "./booking-draft-store";
import {
  catalogDayKey,
  catalogSelectedDateLabel,
  catalogTimezoneLabel,
} from "./catalog-booking-logic";

const mem = new Map<string, string>();
beforeEach(() => {
  mem.clear();
  (globalThis as unknown as { window: unknown }).window = {
    location: { host: "book-jorgelina.tulala.digital" },
    sessionStorage: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    },
  };
});

const draft: BookingDraft = {
  offeringId: "off-1",
  step: "who",
  variantId: "v1",
  addOnIds: ["a1"],
  dayIndex: 3,
  dayKey: "2026-10-07",
  time: "10:00",
  liveStarts: "2026-10-07T16:00:00Z",
  name: "Ana",
  email: "ana@example.com",
  phone: "5551234567",
};

test("draft survives close/reopen for the same service", () => {
  const key = bookingDraftKey(null);
  assert.equal(key, "tulala:booking-draft:book-jorgelina.tulala.digital");
  saveBookingDraft(key, draft);
  assert.deepEqual(loadBookingDraft(key, "off-1"), draft);
});

test("a different service starts fresh", () => {
  const key = bookingDraftKey("t1");
  saveBookingDraft(key, draft);
  assert.equal(loadBookingDraft(key, "off-2"), null);
});

test("clear (success or start over) drops the draft", () => {
  const key = bookingDraftKey("t1");
  saveBookingDraft(key, draft);
  clearBookingDraft(key);
  assert.equal(loadBookingDraft(key, "off-1"), null);
});

test("drafts are keyed per talent site", () => {
  saveBookingDraft(bookingDraftKey("a"), draft);
  assert.equal(loadBookingDraft(bookingDraftKey("b"), "off-1"), null);
});

test("selected date label is localized", () => {
  const d = new Date(2026, 9, 7);
  assert.equal(catalogSelectedDateLabel(d, true), "Miércoles 7 oct");
  assert.equal(catalogSelectedDateLabel(d, false), "Wednesday Oct 7");
  assert.equal(catalogDayKey(d), "2026-10-07");
});

test("timezone label uses the city, falling back to the zone name", () => {
  // TUL-494: Spanish pages must not leak the English city name.
  assert.equal(catalogTimezoneLabel("America/Mexico_City", true), "Hora de Ciudad de México");
  assert.equal(catalogTimezoneLabel("America/Mexico_City", false), "Mexico City time");
  assert.equal(catalogTimezoneLabel("America/Cancun", true), "Hora de Cancún");
  assert.equal(catalogTimezoneLabel("America/Cancun", false), "Cancún time");
  assert.equal(catalogTimezoneLabel("America/New_York", true), "Hora de Nueva York");
  assert.equal(catalogTimezoneLabel("America/New_York", false), "New York time");
  assert.equal(catalogTimezoneLabel("UTC", false), "UTC time");
  assert.equal(catalogTimezoneLabel("", true), "");
});
