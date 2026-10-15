import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { timeSlotLabel, timeSlotOptions } from "./time-slots";

test("TUL-992: Spanish hours read 24h, English 12h", () => {
  assert.equal(timeSlotLabel(9 * 60, "es"), "09:00");
  assert.equal(timeSlotLabel(19 * 60, "es"), "19:00");
  assert.equal(timeSlotLabel(19 * 60, "en"), "7:00 PM");
  assert.equal(timeSlotLabel(0, "en"), "12:00 AM");
});

test("slots cover the day every 15 minutes and keep an off-grid current value", () => {
  assert.equal(timeSlotOptions("es").length, 96);
  assert.ok(timeSlotOptions("es", 9 * 60 + 10).some((o) => o.value === 550));
});

test("the setup hours picker no longer uses a device-locale time input", () => {
  const src = readFileSync(join(process.cwd(), "src/components/onboarding/steps/setup-hours.tsx"), "utf8");
  assert.doesNotMatch(src, /type="time"/);
  assert.match(src, /timeSlotOptions\(locale/);
});
