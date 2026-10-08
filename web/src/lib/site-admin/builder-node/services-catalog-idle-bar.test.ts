import assert from "node:assert/strict";
import { test } from "node:test";

import type { TalentOffering } from "@/lib/talent/offerings-types";
import { catalogTakesBookings, idleBarLabel } from "./services-catalog-idle-bar";

test("idle bar label follows context (ES + EN)", () => {
  assert.equal(idleBarLabel(true, false), "Ver servicios");
  assert.equal(idleBarLabel(true, true), "Elige un servicio");
  assert.equal(idleBarLabel(false, false), "See services");
  assert.equal(idleBarLabel(false, true), "Choose a service");
});

test("TUL-72: booking sites say Reservar cita / Book an appointment", () => {
  assert.equal(idleBarLabel(true, false, true), "Reservar cita");
  assert.equal(idleBarLabel(false, false, true), "Book an appointment");
  // In-view state and inquiry-only sites are unchanged.
  assert.equal(idleBarLabel(true, true, true), "Elige un servicio");
  assert.equal(idleBarLabel(false, true, true), "Choose a service");
  assert.equal(idleBarLabel(true, false, false), "Ver servicios");
  assert.equal(idleBarLabel(false, false, false), "See services");
});

const base = {
  kind: "service",
  bookingMode: null,
  priceType: "fixed",
  priceDisplay: "show",
  amountCents: 5000,
  visibility: "public",
} as unknown as TalentOffering;

test("TUL-72: catalogTakesBookings follows the derived CTA", () => {
  assert.equal(catalogTakesBookings([{ ...base, bookingMode: "instant" }], {}), true);
  assert.equal(catalogTakesBookings([{ ...base, bookingMode: "request" }], {}), true);
  assert.equal(catalogTakesBookings([{ ...base, bookingMode: "inquiry" }], {}), false);
  assert.equal(catalogTakesBookings([{ ...base, amountCents: null, bookingMode: "instant" }], {}), false);
  assert.equal(catalogTakesBookings([{ ...base, visibility: "on_request" }], {}), false);
  assert.equal(catalogTakesBookings([], {}), false);
  assert.equal(catalogTakesBookings([{ ...base, bookingMode: "inquiry" }, { ...base, bookingMode: "instant" }], {}), true);
});
