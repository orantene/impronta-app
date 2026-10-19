import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { catalogTimezoneLabel } from "@/components/public-booking/catalog-booking-logic";
import { formatZonedWhen } from "@/lib/client-account/area-pure";
import { zoneTimeLabel } from "./zone-time-label";

/** TUL-1147: the booking confirmation and the client's visit page name the zone the same way. */
for (const [zone, es, label] of [
  ["America/Cancun", true, "Hora de Cancún"],
  ["America/Cancun", false, "Cancún time"],
  ["America/Merida", true, "Hora de Mérida"],
] as const) {
  test(`TUL-1147: ${zone} (${es ? "es" : "en"}) reads "${label}" on both surfaces`, () => {
    assert.equal(zoneTimeLabel(zone, es), label);
    assert.equal(catalogTimezoneLabel(zone, es), label);
    const visit = formatZonedWhen("2026-10-14T20:00:00Z", zone, es ? "es" : "en");
    assert.equal(visit?.tzLabel, label);
    assert.doesNotMatch(visit?.tzLabel ?? "", /GMT|UTC[+-]|\//);
  });
}

test("TUL-1147: no zone, no label (the line is never dangling)", () => {
  assert.equal(zoneTimeLabel(null, true), "");
  assert.equal(zoneTimeLabel("  ", false), "");
});

test("TUL-1147: the booking logic delegates to the shared label instead of keeping its own copy", () => {
  const src = readFileSync("src/components/public-booking/catalog-booking-logic.ts", "utf8");
  assert.match(src, /return zoneTimeLabel\(tz, es, placeCity\)/);
  assert.doesNotMatch(src, /ZONE_CITY_DISPLAY/);
});
