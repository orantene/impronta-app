import assert from "node:assert/strict";
import test from "node:test";

import { VENUE_TIME_UNKNOWN, venueHhmm, venueZoneLabel } from "./venue-clock";

const MEXICO = "America/Mexico_City";

test("an instant renders as the venue's wall clock, not the caller's", () => {
  // 02:00 UTC on 11 September is 20:00 on the 10th in Mexico City. The two
  // are on different DAYS as well as different hours, which is the shape of
  // the bug: a host reading "due back 02:00" would go looking for a table
  // that is actually due back before the evening is over.
  assert.equal(venueHhmm("2026-09-11T02:00:00.000Z", MEXICO, "en"), "20:00");
  assert.equal(venueHhmm("2026-09-11T02:00:00.000Z", "Asia/Tokyo", "en"), "11:00");
  assert.equal(venueHhmm("2026-09-11T02:00:00.000Z", "UTC", "en"), "02:00");
});

test("the same instant is the same string in every locale", () => {
  // 24-hour on purpose: "8" on a service board is ambiguous, and the host
  // stand settled this before the floor existed.
  const iso = "2026-09-11T02:00:00.000Z";
  assert.equal(venueHhmm(iso, MEXICO, "es"), "20:00");
  assert.equal(venueHhmm(iso, MEXICO, "fr"), "20:00");
  assert.equal(venueHhmm(iso, MEXICO, "en"), "20:00");
});

test("midnight reads 00:xx, never 24:xx — in every language", () => {
  // 06:10 UTC is 00:10 in Mexico City. `hour12: false` — what the host stand
  // shipped with — resolves to the h24 cycle in English on this ICU build and
  // renders "24:10", while Spanish and French render "00:10" from the SAME
  // call. A clock that reads 24:10 is not a clock any restaurant has.
  for (const locale of ["en", "es", "fr"]) {
    assert.equal(venueHhmm("2026-09-11T06:10:00.000Z", MEXICO, locale), "00:10", locale);
  }
});

test("an unusable zone falls back to UTC and says so, never to the process clock", () => {
  // The dangerous failure mode is silence: formatting in whatever zone the
  // runtime happens to be on and looking correct on the developer's laptop.
  assert.equal(venueHhmm("2026-09-11T02:00:00.000Z", "Not/AZone", "en"), "02:00");
  assert.equal(venueZoneLabel("Not/AZone", "en", new Date("2026-09-11T02:00:00.000Z")), "UTC (GMT+0)");
});

test("an unparseable instant is visibly missing, not silently now", () => {
  assert.equal(venueHhmm("not-a-date", MEXICO, "en"), VENUE_TIME_UNKNOWN);
  assert.equal(venueHhmm("", MEXICO, "en"), VENUE_TIME_UNKNOWN);
});

test("the zone is named to a human with its offset at that moment", () => {
  // Mexico City abolished DST in 2022 and sits on GMT-6 year round; the label
  // still takes the instant, because a zone that does observe DST changes
  // offset and a label frozen at import time would be wrong half the year.
  assert.equal(
    venueZoneLabel(MEXICO, "en", new Date("2026-09-11T02:00:00.000Z")),
    "America/Mexico_City (GMT-6)",
  );
  assert.equal(
    venueZoneLabel("Europe/Paris", "en", new Date("2026-01-15T12:00:00.000Z")),
    "Europe/Paris (GMT+1)",
  );
  assert.equal(
    venueZoneLabel("Europe/Paris", "en", new Date("2026-07-15T12:00:00.000Z")),
    "Europe/Paris (GMT+2)",
  );
});
