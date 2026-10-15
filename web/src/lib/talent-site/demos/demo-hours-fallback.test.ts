/**
 * TUL-539 / GRK-002: demo public-hours fallback.
 *   cd web && npx tsx --test src/lib/talent-site/demos/demo-hours-fallback.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bookingHoursFromDemoSpec,
  demoPublicBookingHoursFallback,
} from "./demo-hours-fallback";

test("non-demo never invents hours", () => {
  assert.equal(
    demoPublicBookingHoursFallback({
      isDemo: false,
      profileCode: "TAL-93005",
      durationMinutes: 300,
    }),
    null,
  );
});

test("Diego roster fallback fits 5h wedding and opens Thu–Sun evenings", () => {
  const h = demoPublicBookingHoursFallback({
    isDemo: true,
    profileCode: "TAL-93005",
    durationMinutes: 300,
  });
  assert.ok(h);
  assert.equal(h!.timezone, "America/Monterrey");
  assert.equal(h!.horizonDays, 14);
  assert.ok(h!.weekly[4]!.length > 0);
  assert.ok(h!.weekly[5]!.length > 0);
  assert.ok(h!.weekly[6]!.length > 0);
  assert.ok(h!.weekly[0]!.length > 0);
  assert.equal(h!.weekly[1]!.length, 0);
  const w = h!.weekly[5]![0]!;
  assert.ok(w.endMin - w.startMin >= 300);
});

test("unknown demo still gets a duration-fitting default window", () => {
  const h = demoPublicBookingHoursFallback({
    isDemo: true,
    profileCode: "TAL-99999",
    homeCity: "Cancún",
    durationMinutes: 120,
  });
  assert.ok(h);
  assert.equal(h!.timezone, "America/Cancun");
  const open = Object.values(h!.weekly).find((d) => d.length > 0)?.[0];
  assert.ok(open);
  assert.ok(open!.endMin - open!.startMin >= 180);
});

test("bookingHoursFromDemoSpec maps days to weekly windows", () => {
  const h = bookingHoursFromDemoSpec({
    timezone: "America/Monterrey",
    days: [5],
    startMin: 16 * 60,
    endMin: 23 * 60,
    slotMinutes: 60,
  });
  assert.equal(h.weekly[5]![0]!.startMin, 16 * 60);
  assert.equal(h.weekly[4]!.length, 0);
});
