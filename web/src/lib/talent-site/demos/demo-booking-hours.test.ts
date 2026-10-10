import assert from "node:assert/strict";
import { test } from "node:test";

import {
  hoursFitDuration,
  maxTimedServiceMinutes,
  resolvedDemoBookingHours,
  timedBookableServices,
  timezoneForDemoCity,
} from "./demo-booking-hours";
import { DEMOS } from "../../../../scripts/demo-talents/demos";

test("timezoneForDemoCity maps Monterrey and coastal cities", () => {
  assert.equal(timezoneForDemoCity("Monterrey"), "America/Monterrey");
  assert.equal(timezoneForDemoCity("Playa del Carmen"), "America/Cancun");
  assert.equal(timezoneForDemoCity("Ciudad de México"), "America/Mexico_City");
});

test("quote-only catalogs need no hours", () => {
  assert.equal(
    resolvedDemoBookingHours({
      city: "CDMX",
      services: [{ durationMin: 60, booking: "quote" }],
    }),
    null,
  );
});

test("missing hours get a window that fits the longest timed service (Diego 300)", () => {
  const h = resolvedDemoBookingHours({
    city: "Monterrey",
    services: [
      { durationMin: 300, booking: "request" },
      { durationMin: 240, booking: "request" },
      { durationMin: 60, booking: "request" },
    ],
  });
  assert.ok(h);
  assert.equal(h!.timezone, "America/Monterrey");
  assert.ok(hoursFitDuration(h!, 300));
  assert.ok(h!.endMin - h!.startMin >= 360);
});

test("too-narrow explicit hours are widened", () => {
  const h = resolvedDemoBookingHours({
    city: "Monterrey",
    services: [{ durationMin: 300, booking: "request" }],
    hours: {
      timezone: "America/Monterrey",
      days: [5, 6],
      startMin: 18 * 60,
      endMin: 20 * 60,
      slotMinutes: 60,
    },
  });
  assert.ok(h);
  assert.ok(hoursFitDuration(h!, 300));
  assert.deepEqual(h!.days, [5, 6]);
  assert.equal(h!.startMin, 18 * 60);
});

test("every DEMOS roster entry with timed bookable services resolves fitting hours", () => {
  for (const d of DEMOS) {
    const timed = timedBookableServices(d.services);
    if (timed.length === 0) continue;
    const h = resolvedDemoBookingHours({
      city: d.city,
      services: d.services,
      hours: d.hours ?? null,
    });
    assert.ok(h, `${d.profileCode} must resolve hours`);
    const max = maxTimedServiceMinutes(d.services);
    assert.ok(hoursFitDuration(h!, max), `${d.profileCode} window must fit ${max}m`);
  }
});
