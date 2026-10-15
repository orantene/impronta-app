/**
 * TUL-548 GRK-068: Valeria (TAL-93001) has bookings off but the hub still said "Reservar".
 * Offerings that went through the public loader with accepting_bookings off must give the hub an
 * inquire entry, never a bookable sheet.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { withPublicAvailability } from "@/lib/talent/offering-policy-resolver";
import type { TalentOffering } from "@/lib/talent/offerings-types";
import { hubProfileBookEntry } from "./hub-profile-book-entry";
import { resolveHubProfileCta } from "./hub-profile-book-cta";

const base = {
  id: "o1", talentProfileId: "t1", kind: "service", title: "Clase privada", bookingMode: "instant",
  priceType: "per_contact", priceDisplay: "exact", amountCents: 70000, currency: "MXN", durationMinutes: 60,
  reserveMode: "free", allowPayInPerson: true, visibility: "public", sortOrder: 0, imageUrls: [], attributes: {},
} as unknown as TalentOffering;
const ready = { hasWorkingHours: true, payoutsReady: true, planAllowsInstant: true };
const load = (acceptingBookings: boolean, acceptingInquiries = true) =>
  [withPublicAvailability(base, {}, { ...ready, switches: { acceptingBookings, acceptingInquiries } })];

test("bookings on: the hub books", () => {
  const entry = hubProfileBookEntry(load(true), "talent_pro");
  assert.equal(resolveHubProfileCta({ platformHost: true, hasBookableServices: entry.kind === "sheet" }).kind, "book");
});

test("bookings off: the hub inquires, never Reservar", () => {
  for (const inquiries of [true, false]) {
    const entry = hubProfileBookEntry(load(false, inquiries), "talent_pro");
    assert.equal(entry.kind, "inquire", `inquiries=${inquiries}`);
    assert.equal(resolveHubProfileCta({ platformHost: true, hasBookableServices: false }).kind, "inquire");
  }
});
