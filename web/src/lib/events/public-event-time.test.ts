import assert from "node:assert/strict";
import { test } from "node:test";

import { nightLabelWithCity, resolvePublicZone, timeLabel, whenLabel, zoneCity } from "./public-event-time";

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

test("no zone produces a sentence, never a date in anyone's clock", () => {
  assert.equal(whenLabel(STARTS, null, "en"), "Time to be confirmed by the venue");
  assert.equal(whenLabel(STARTS, null, "es"), "Horario a confirmar por el local");
  assert.equal(timeLabel(STARTS, null, "en"), "Time to be confirmed by the venue");
});

test("the platform rung is refused; venue and workspace rungs are not", () => {
  assert.equal(resolvePublicZone({ venue: null, workspace: null }), null);
  assert.equal(resolvePublicZone({ venue: null, workspace: ZONE }), ZONE);
  assert.equal(resolvePublicZone({ venue: ZONE, workspace: "UTC" }), ZONE);
  // The unreadable-row case: both null used to render "September 8, 12:00 AM".
  assert.equal(whenLabel(STARTS, resolvePublicZone({ venue: null, workspace: null })), "Time to be confirmed by the venue");
});

test("the ticket's night label names the zone as a city, never an abbreviation", () => {
  assert.equal(nightLabelWithCity("2026-10-03T23:00:00Z", "America/Cancun", "es"), "sábado 3 de octubre, 18:00 h (hora de Cancún)");
  assert.equal(nightLabelWithCity("2026-10-03T23:00:00Z", "America/Cancun", "en"), "Saturday, October 3, 6:00 PM (Cancún time)");
  assert.equal(nightLabelWithCity(STARTS, ZONE, "en"), "Monday, September 7, 9:00 PM (Buenos Aires time)");
  assert.equal(nightLabelWithCity("2026-09-08T09:05:00Z", "America/Cancun", "es"), "martes 8 de septiembre, 04:05 h (hora de Cancún)");
  // An unknown city falls back to the IANA segment with spaces.
  assert.match(nightLabelWithCity(STARTS, "America/Port_of_Spain", "en"), /\(Port of Spain time\)$/);
  // Refusals match whenLabel: no instant, no zone.
  assert.equal(nightLabelWithCity(null, ZONE, "es"), "Fecha a confirmar");
  assert.equal(nightLabelWithCity(STARTS, null, "en"), "Time to be confirmed by the venue");
  assert.equal(zoneCity("America/Mexico_City", "es"), "Ciudad de México");
});
