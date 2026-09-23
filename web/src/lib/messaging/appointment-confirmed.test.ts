import assert from "node:assert/strict";
import { test } from "node:test";

import { appointmentConfirmedBody } from "./appointment-confirmed";

test("no address stays the short confirmation", () => {
  assert.equal(appointmentConfirmedBody(null), "Appointment confirmed");
  assert.equal(appointmentConfirmedBody("  "), "Appointment confirmed");
});

test("a known address is named in the confirmation", () => {
  assert.equal(
    appointmentConfirmedBody("Calle 10, Playa del Carmen"),
    "Appointment confirmed. Exact address: Calle 10, Playa del Carmen",
  );
});
