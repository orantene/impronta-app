import test from "node:test";
import assert from "node:assert/strict";

import {
  assertInstantPlanCeiling,
  instantReservationConfirmedBody,
  reservationStampForInstant,
} from "./instant-book-gates";

test("free plan cannot auto-confirm (request ceiling)", () => {
  const gate = assertInstantPlanCeiling("free");
  assert.equal(gate.ok, false);
  if (!gate.ok) {
    assert.equal(gate.reason, "plan_lacks_capability");
    assert.equal(gate.maxMode, "request");
    assert.equal(gate.requiredMode, "instant");
  }
});

test("website and above can instant", () => {
  assert.equal(assertInstantPlanCeiling("website").ok, true);
  assert.equal(assertInstantPlanCeiling("studio").ok, true);
  assert.equal(assertInstantPlanCeiling("agency").ok, true);
});

test("unknown plan fails closed", () => {
  const gate = assertInstantPlanCeiling("enterprise-gold");
  assert.equal(gate.ok, false);
  if (!gate.ok) assert.equal(gate.maxMode, "off");
});

test("instant stamp is mode instant so convert enrichment applies", () => {
  const stamp = reservationStampForInstant({
    offeringId: "11111111-1111-4111-8111-111111111111",
    window: {
      startsAt: "2026-09-01T15:00:00.000Z",
      endsAt: "2026-09-01T16:00:00.000Z",
      timezone: "America/New_York",
    },
    durationMinutes: 60,
    holdId: "h1",
  });
  assert.equal(stamp.mode, "instant");
  assert.equal(stamp.hold_id, "h1");
});

test("instant confirm copy is terminology-aware and not request-received", () => {
  assert.equal(
    instantReservationConfirmedBody("reservation", "en"),
    "Your reservation is confirmed.",
  );
  assert.equal(
    instantReservationConfirmedBody("cita", "es"),
    "Tu cita esta confirmada.",
  );
  assert.doesNotMatch(instantReservationConfirmedBody("reservation", "en"), /received/i);
});
