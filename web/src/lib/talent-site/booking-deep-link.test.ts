import assert from "node:assert/strict";
import { test } from "node:test";

import { parseBookingDeepLink } from "./booking-deep-link";
import {
  bookingEventDetail,
  openBookingAtSlot,
  openDeepLinkFromLocation,
  registerBookableOffering,
  sanitizeSlotStart,
} from "./open-booking-at-slot";
import type { OfferingRequestDetail } from "@/lib/talent/offering-request-detail";

const ID = "0b9f0c3e-5d2a-4f6e-8a1b-3c4d5e6f7a8b";
const NOW = new Date("2026-10-08T12:00:00.000Z");
const FUTURE = "2026-10-09T15:00:00.000Z";

test("valid link returns the offering and the slot", () => {
  assert.deepEqual(parseBookingDeepLink(`?book=${ID}&slot=${FUTURE}`, "#book", NOW), {
    offeringId: ID,
    slotStart: FUTURE,
  });
  assert.deepEqual(parseBookingDeepLink(`book=${ID}`, "#book", NOW), { offeringId: ID, slotStart: null });
});

test("malformed or past slot keeps the offering with slotStart null", () => {
  for (const slot of ["tomorrow", "2026-10-09", "2026-13-40T00:00:00Z", "2026-10-09T15:00:00+02:00", "2026-10-01T10:00:00.000Z", NOW.toISOString()]) {
    assert.deepEqual(parseBookingDeepLink(`?book=${ID}&slot=${encodeURIComponent(slot)}`, "#book", NOW), {
      offeringId: ID,
      slotStart: null,
    });
  }
});

test("missing offering, non-UUID, or wrong hash is not a deep link", () => {
  assert.equal(parseBookingDeepLink(`?slot=${FUTURE}`, "#book", NOW), null);
  assert.equal(parseBookingDeepLink(`?book=not-a-uuid&slot=${FUTURE}`, "#book", NOW), null);
  assert.equal(parseBookingDeepLink(`?book=${ID}&slot=${FUTURE}`, "#talent-ask", NOW), null);
  assert.equal(parseBookingDeepLink(`?book=${ID}&slot=${FUTURE}`, "", NOW), null);
});

const detail: OfferingRequestDetail = {
  offeringId: ID,
  talentProfileId: null,
  title: "Cut",
  kind: "service",
  priceType: "fixed",
  amountCents: 5000,
  currency: "USD",
  durationMinutes: 45,
  allowPayInPerson: true,
  reserveMode: "free",
  depositPct: null,
  imageUrl: null,
  intent: "instant",
};

function fakeTarget() {
  const events: CustomEvent[] = [];
  return { events, dispatchEvent: (e: Event) => (events.push(e as CustomEvent), true) };
}

test("emitter puts slotStart in the detail and leaves it absent otherwise", () => {
  const t = fakeTarget();
  assert.equal(openBookingAtSlot({ offeringId: ID, slotStart: FUTURE, detail }, t), true);
  assert.equal(t.events[0]!.type, "tulala:offering-instant");
  assert.equal((t.events[0]!.detail as OfferingRequestDetail).slotStart, FUTURE);

  const t2 = fakeTarget();
  openBookingAtSlot({ offeringId: ID, detail: { ...detail, intent: "request" } }, t2);
  assert.equal(t2.events[0]!.type, "tulala:offering-slot");
  assert.equal("slotStart" in (t2.events[0]!.detail as object), false);
});

test("a detail without a slot is the same object, byte-identical", () => {
  assert.equal(bookingEventDetail(detail), detail);
  assert.equal(bookingEventDetail(detail, null), detail);
  assert.equal(JSON.stringify(bookingEventDetail(detail)), JSON.stringify(detail));
});

test("unknown offering dispatches nothing; deep link resolves via the registry", () => {
  const t = fakeTarget();
  const other = "11111111-2222-4333-8444-555555555555";
  assert.equal(openBookingAtSlot({ offeringId: other, slotStart: FUTURE }, t), false);
  assert.equal(t.events.length, 0);

  const loc = { search: `?book=${ID}&slot=${FUTURE}`, hash: "#book" };
  assert.equal(openDeepLinkFromLocation(loc, { now: NOW, target: t }), "unresolved");
  registerBookableOffering(detail);
  assert.equal(openDeepLinkFromLocation(loc, { now: NOW, target: t }), "opened");
  assert.equal((t.events[0]!.detail as OfferingRequestDetail).slotStart, FUTURE);
  // A retry while the sheet is open must not dispatch again.
  assert.equal(openDeepLinkFromLocation(loc, { now: NOW, target: t, alreadyOpen: () => true }), "opened");
  assert.equal(t.events.length, 1);
  assert.equal(openDeepLinkFromLocation({ search: "", hash: "#book" }, { now: NOW, target: t }), "none");
});

test("fallback: a malformed or past slotStart opens the normal sheet with no slot", () => {
  for (const bad of ["garbage", "2026-10-01T10:00:00.000Z", ""]) {
    const t = fakeTarget();
    assert.equal(openBookingAtSlot({ offeringId: ID, slotStart: bad, detail, now: NOW }, t), true);
    assert.equal("slotStart" in (t.events[0]!.detail as object), false);
  }
  assert.equal(sanitizeSlotStart("2026-10-09T17:00:00+02:00", NOW), FUTURE);
  assert.equal(sanitizeSlotStart(null, NOW), null);
});

test("fallback: a purchase offering is not bookable at a slot (returns false, no event)", () => {
  const t = fakeTarget();
  const product = { ...detail, kind: "product" };
  assert.equal(openBookingAtSlot({ offeringId: ID, slotStart: FUTURE, detail: product, now: NOW }, t), false);
  assert.equal(t.events.length, 0);
});
