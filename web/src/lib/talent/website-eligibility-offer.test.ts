/**
 * F84: a free-plan talent whose services book by REQUEST (instant capped by
 * the plan) still has "Things clients can book or ask about" done.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { READINESS_GAP_COPY, readinessGaps } from "./accepting-readiness";
import { getWebsiteEligibility } from "./website-eligibility";
import { countBookableOfferings } from "./website-eligibility-facts";

// Valeria's shape: 3 published services, durations set, hours saved, free plan.
const services = [
  { status: "published", bookingMode: "request", durationMinutes: 90 },
  { status: "published", bookingMode: "request", durationMinutes: 60 },
  { status: "published", bookingMode: null, durationMinutes: 30 },
];

test("request-mode services on the free plan all count as bookable", () => {
  // The plan ceiling is a gap for INSTANT only...
  const gaps = readinessGaps({
    kind: "service",
    hasWorkingHours: true,
    durationMinutes: 60,
    takesMoneyOnline: true,
    payoutsReady: true,
    planAllowsInstant: false,
  });
  assert.deepEqual(gaps, ["plan"]);
  assert.ok(READINESS_GAP_COPY.plan);
  // ...and never reduces what clients can book or ask about.
  assert.equal(countBookableOfferings(services), 3);
  assert.equal(countBookableOfferings([...services, { status: "archived" }]), 3);
  assert.equal(countBookableOfferings(null), null);
});

test("the offer slice is done and the checklist reaches 100%", () => {
  const e = getWebsiteEligibility({
    hasNameAndWork: true,
    photoCount: 6,
    bookableCount: countBookableOfferings(services),
    hasIntro: true,
    hasAvailability: true,
    hasPlace: true,
  });
  const offer = e.slices.find((s) => s.key === "offer")!;
  assert.equal(offer.done, true);
  assert.equal(e.percent, 100);
});
