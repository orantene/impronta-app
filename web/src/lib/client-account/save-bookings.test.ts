import assert from "node:assert/strict";
import { test } from "node:test";

import { SAVE_BOOKINGS_COPY, SAVE_BOOKINGS_HREF, saveBookingsLocale, shouldShowSaveBookings } from "./save-bookings";

test("copy exists in both languages with the same keys and no em dashes", () => {
  assert.deepEqual(Object.keys(SAVE_BOOKINGS_COPY.es).sort(), Object.keys(SAVE_BOOKINGS_COPY.en).sort());
  for (const lang of ["en", "es"] as const) {
    for (const v of Object.values(SAVE_BOOKINGS_COPY[lang])) assert.doesNotMatch(v, /—/);
  }
  assert.equal(SAVE_BOOKINGS_COPY.es.title, "Guarda tus reservas");
  assert.equal(SAVE_BOOKINGS_COPY.en.title, "Save your bookings");
});

test("the href enters the existing client sign-in and returns to /client, with no email in the URL", () => {
  const u = new URL(SAVE_BOOKINGS_HREF, "https://x.test");
  assert.equal(u.pathname, "/login");
  assert.equal(u.searchParams.get("as"), "client");
  assert.equal(u.searchParams.get("next"), "/client");
  assert.equal(u.searchParams.has("email"), false);
});

test("only a viewer known to be signed out sees the block", () => {
  assert.equal(shouldShowSaveBookings(false), true);
  assert.equal(shouldShowSaveBookings(true), false);
  assert.equal(shouldShowSaveBookings(null), false);
  assert.equal(shouldShowSaveBookings(undefined), false);
});

test("locale folds to en or es", () => {
  assert.equal(saveBookingsLocale("es-MX"), "es");
  assert.equal(saveBookingsLocale("fr"), "en");
  assert.equal(saveBookingsLocale(null), "en");
});
