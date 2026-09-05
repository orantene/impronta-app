import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseWeeklyHours } from "./hours-types";
import {
  assertInstantPlanCeiling,
  instantRequiresSlot,
  instantReservationConfirmedBody,
  reservationStampForInstant,
  weeklyHasBookableWindow,
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

test("product never requires a slot, even with duration and hours", () => {
  assert.equal(
    instantRequiresSlot({ kind: "product", durationMinutes: 30, hasBookableHours: true }),
    false,
  );
});

test("duration-bearing service with hours requires a slot", () => {
  assert.equal(
    instantRequiresSlot({ kind: "service", durationMinutes: 45, hasBookableHours: true }),
    true,
  );
});

test("duration-bearing service with no hours keeps the no-window path", () => {
  assert.equal(
    instantRequiresSlot({ kind: "service", durationMinutes: 45, hasBookableHours: false }),
    false,
  );
});

test("zero or missing duration never requires a slot", () => {
  assert.equal(
    instantRequiresSlot({ kind: "service", durationMinutes: 0, hasBookableHours: true }),
    false,
  );
  assert.equal(
    instantRequiresSlot({ kind: "service", durationMinutes: null, hasBookableHours: true }),
    false,
  );
});

test("weeklyHasBookableWindow is true when any day 0-6 has a window", () => {
  const weekly = parseWeeklyHours({
    2: [{ startMin: 600, endMin: 1080 }],
  });
  assert.equal(weeklyHasBookableWindow(weekly), true);
  assert.equal(weeklyHasBookableWindow(parseWeeklyHours({})), false);
  assert.equal(weeklyHasBookableWindow(null), false);
});

// REPOINTED at the purchase pipeline. `instant-book-engine.ts` was deleted in
// 0.6b-2 and this guard EARNED its keep on the way out: my first rewire dropped
// the slot-required gate entirely, so a timed service with bookable hours would
// have been purchasable with no time attached — a paid appointment nobody could
// attend. The guard outlived the file it pinned and was still right.
const ENGINE = readFileSync(
  join(__dirname, "..", "orders", "purchase.ts"),
  "utf8",
);
const MOUNT = readFileSync(
  join(__dirname, "..", "..", "app", "t", "[profileCode]", "_shared", "OfferingInstantMount.tsx"),
  "utf8",
);

test("engine refuses no-slot instant when a slot is required", () => {
  assert.match(ENGINE, /slot_required/);
  assert.match(ENGINE, /timedInstantMissingSlot/);
});

test("OfferingInstantMount routes a timed+hours Book now to the SlotPicker", () => {
  assert.match(MOUNT, /instantRequiresSlot/);
  assert.match(MOUNT, /tulala:offering-slot/);
});
