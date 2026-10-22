import assert from "node:assert/strict";
import { test } from "node:test";

import { formatRelativeShortZoned, formatStampZoned, validZone, zonedDayKey } from "./viewer-time";

const AT = "2026-10-13T02:30:00Z"; // 21:30 on Oct 12 in Mexico City (UTC-6 in October 2026), 02:30 UTC
const CDMX = "America/Mexico_City";

test("TUL-1909: the clock follows the viewer zone, not UTC", () => {
  const now = new Date("2026-10-13T03:00:00Z");
  assert.equal(formatStampZoned(AT, now, "es", CDMX), "20:30");
  assert.equal(formatStampZoned(AT, now, "es", "UTC"), "02:30");
  assert.equal(formatStampZoned(AT, now, "es", "Asia/Tokyo"), "11:30");
});

test("TUL-1909: 'same day' uses the viewer calendar", () => {
  assert.equal(zonedDayKey(new Date(AT), CDMX), "2026-10-12");
  assert.equal(zonedDayKey(new Date(AT), "UTC"), "2026-10-13");
  // Viewer in Mexico City: sent 20:30 on the 12th, now 20:50 on the 12th -> same day, clock only.
  const sameDayNow = new Date("2026-10-13T02:50:00Z");
  assert.equal(formatRelativeShortZoned(AT, sameDayNow, "es", CDMX), "20m");
  const laterNow = new Date("2026-10-13T05:00:00Z");
  assert.equal(formatRelativeShortZoned(AT, laterNow, "es", CDMX), "20:30");
  // Later on Oct 13 UTC: a UTC reader still sees a same-day clock, a Mexico City reader sees the previous day.
  const nextUtcDay = new Date("2026-10-13T20:00:00Z");
  assert.equal(formatRelativeShortZoned(AT, nextUtcDay, "es", "UTC"), "02:30");
  assert.notEqual(formatRelativeShortZoned(AT, nextUtcDay, "es", CDMX), "20:30");
});

test("TUL-1909: older stamps carry the date in the viewer zone", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  const out = formatStampZoned(AT, now, "es", CDMX);
  assert.match(out, /12/);
  assert.match(out, /20:30$/);
});

test("TUL-1909: a bad zone falls back instead of throwing; saved zone validation", () => {
  assert.equal(validZone("Not/AZone"), null);
  assert.equal(validZone(CDMX), CDMX);
  assert.equal(formatStampZoned(AT, new Date("2026-10-13T03:00:00Z"), "es", "Not/AZone").length > 0, true);
});
