import assert from "node:assert/strict";
import { test } from "node:test";

import { timeLabel, whenLabel } from "./public-event-time";

// The first real event: "Noche de prueba", El Paisa, session
// 7c6ecaf8-20ac-4782-84b5-245f27a5e38a — 2026-09-07 21:00 to 23:59 in
// America/Argentina/Buenos_Aires, stored as 2026-09-08T00:00:00Z. Measured
// live rendering "Tuesday, September 8 at 12:00 AM" (CEO, 2026-09-05).
const STARTS = "2026-09-08T00:00:00.000Z";
const ZONE = "America/Argentina/Buenos_Aires";

test("the night renders on the venue's day, at the venue's hour, with the zone named", () => {
  const label = whenLabel(STARTS, ZONE, "en");
  assert.match(label, /Monday/);
  assert.match(label, /September 7/);
  assert.match(label, /9:00 PM/);
  assert.match(label, /GMT-3|ART/);
  assert.doesNotMatch(label, /September 8|12:00 AM/);
});

test("doors label is time-only in the venue's zone", () => {
  const doors = new Date(Date.parse(STARTS) - 60 * 60_000).toISOString();
  const label = timeLabel(doors, ZONE, "en");
  assert.match(label, /8:00 PM/);
  assert.match(label, /GMT-3|ART/);
});

test("spanish reads a 24h clock on the venue's day", () => {
  const label = whenLabel(STARTS, ZONE, "es");
  assert.match(label, /lunes/);
  assert.match(label, /7 de septiembre/);
  assert.match(label, /21:00/);
});

test("date-only label carries no time and no zone", () => {
  const label = whenLabel(STARTS, ZONE, "en", false);
  assert.match(label, /September 7/);
  assert.doesNotMatch(label, /PM|GMT/);
});

test("absence is a sentence, never the reader's clock", () => {
  assert.equal(whenLabel(null, ZONE), "Date to be announced");
  assert.equal(whenLabel("not-a-date", ZONE, "es"), "Fecha a confirmar");
});
