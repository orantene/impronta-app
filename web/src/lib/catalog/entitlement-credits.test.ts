import { test } from "node:test";
import assert from "node:assert/strict";
import { reserveCreditForBooking, transitionCredit } from "./entitlement-credits";

test("issued credit can be reserved by a booking", () => {
  assert.deepEqual(reserveCreditForBooking("issued"), { ok: true, next: "reserved" });
});

test("consumed credit cannot be reserved again", () => {
  assert.equal(transitionCredit("consumed", "reserved").ok, false);
});
