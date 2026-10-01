/**
 * F27: the free-tier ceiling is a readiness gap, so offerings, the site CTA
 * mode and the settings copy all say request, with the upgrade line.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { READINESS_GAP_COPY, readinessGaps } from "./accepting-readiness";
import { withPublicAvailability } from "./offering-policy-resolver";

const ready = { kind: "service", hasWorkingHours: true, durationMinutes: 60, takesMoneyOnline: true, payoutsReady: true };

test("a plan without instant is the only gap reported", () => {
  assert.deepEqual(readinessGaps({ ...ready, planAllowsInstant: false }), ["plan"]);
  assert.deepEqual(readinessGaps({ ...ready, planAllowsInstant: true }), []);
  assert.deepEqual(readinessGaps(ready), []);
  assert.equal(READINESS_GAP_COPY.plan, "Instant booking is not available on this plan");
  assert.doesNotMatch(READINESS_GAP_COPY.plan, /—/);
});

test("an instant service resolves to request only when the plan lacks instant", () => {
  const offering = {
    bookingMode: "instant" as const,
    kind: "service",
    durationMinutes: 60,
    reserveMode: "full" as const,
  };
  const free = withPublicAvailability(offering, {}, { hasWorkingHours: true, payoutsReady: true, planAllowsInstant: false });
  assert.equal(free.bookingMode, "request");
  const paid = withPublicAvailability(offering, {}, { hasWorkingHours: true, payoutsReady: true, planAllowsInstant: true });
  assert.equal(paid.bookingMode, "instant");
});
