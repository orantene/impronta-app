import assert from "node:assert/strict";
import { test } from "node:test";

import { formatClock } from "./clock";

const AT = "2026-10-13T21:30:00Z";

test("TUL-379: Spanish and French clocks are 24 hour, English keeps its own convention", () => {
  assert.equal(formatClock(AT, "es", "UTC"), "21:30");
  assert.equal(formatClock(AT, "es-MX", "UTC"), "21:30");
  assert.equal(formatClock("2026-10-13T09:05:00Z", "es", "UTC"), "09:05");
  assert.equal(formatClock(AT, "fr", "UTC"), "21:30");
  assert.match(formatClock(AT, "en", "UTC"), /9:30\s?PM/);
  assert.equal(formatClock("2026-10-13T00:05:00Z", "es-MX", "UTC"), "00:05");
  assert.equal(formatClock("nope", "es"), "");
});
