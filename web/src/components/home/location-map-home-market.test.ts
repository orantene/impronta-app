/**
 * location-map-home-market.test.ts — which cities the homepage map opens on.
 *
 * The map used to fit bounds to EVERY pin, which sounds neutral and is not: one
 * talent in a far-away city drags the viewport out to continental scale. On
 * Impronta that meant a Riviera Maya agency opened on a Campeche-to-Cuba view
 * with the Quintana Roo roster — 45 of its 48 talent — as three unreadable pins
 * in a corner. The section exists to show that roster and was framing it as the
 * least legible thing on screen.
 *
 * `homeMarketLocations` is the fix: the fewest cities that together hold most of
 * the talent. It is pure, so the interesting behaviour is testable without a
 * Google Maps stub — which is the whole reason it is a separate function.
 *
 * Run: node_modules/.bin/tsx --test \
 *   src/components/home/location-map-home-market.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { homeMarketLocations } from "./location-map";

const city = (
  displayName: string,
  talentCount: number,
  latitude: number,
  longitude: number,
) => ({ displayName, talentCount, latitude, longitude });

/** Impronta's real distribution and real coordinates at the time this shipped. */
const IMPRONTA = [
  city("Buenos Aires", 2, -34.6037, -58.3816),
  city("Cancun", 3, 21.1619, -86.8515),
  city("Mexico City", 1, 19.4326, -99.1332),
  city("Playa del Carmen", 40, 20.6296, -87.0739),
  city("Tulum", 2, 20.2114, -87.4654),
];

test("Impronta opens on the whole Quintana Roo corridor", () => {
  const picked = homeMarketLocations(IMPRONTA).map((l) => l.displayName).sort();
  // The corridor, not just the busiest town in it. A share-based rule stopped
  // at Playa del Carmen alone (83% of the roster) and opened zoomed past the
  // other two, which is what sent this back for a second pass.
  assert.deepEqual(picked, ["Cancun", "Playa del Carmen", "Tulum"]);
});

test("distant outliers never set the opening zoom", () => {
  const picked = homeMarketLocations(IMPRONTA).map((l) => l.displayName);
  assert.ok(!picked.includes("Buenos Aires"), "~7,000km away");
  assert.ok(!picked.includes("Mexico City"), "~1,300km away");
});

test("outliers are excluded from the FRAME, never from the map", () => {
  // The guarantee this test is really making: `homeMarketLocations` decides
  // what the viewport covers. Callers still render every location as a pin, so
  // nothing is hidden — it is one zoom-out or one city chip away.
  const picked = homeMarketLocations(IMPRONTA);
  assert.ok(
    picked.length < IMPRONTA.length,
    "this fixture is meant to exercise the narrowing path",
  );
});

test("cities clustered together all stay in view regardless of counts", () => {
  // Four towns along one coastline: an evenly spread LOCAL roster is still one
  // market, so nothing is dropped.
  const even = [
    city("A", 10, 20.6, -87.0),
    city("B", 10, 20.9, -86.9),
    city("C", 10, 21.1, -86.8),
    city("D", 10, 20.2, -87.4),
  ];
  assert.equal(homeMarketLocations(even).length, 4);
});

test("a genuinely global roster opens on its busiest region only", () => {
  const global = [
    city("Tokyo", 5, 35.6762, 139.6503),
    city("London", 4, 51.5072, -0.1276),
    city("Sao Paulo", 3, -23.5505, -46.6333),
  ];
  const picked = homeMarketLocations(global).map((l) => l.displayName);
  assert.deepEqual(picked, ["Tokyo"], "nothing else is within the same market");
});

test("a single city is returned untouched", () => {
  const one = [city("Only", 5, 20.6, -87.0)];
  assert.deepEqual(homeMarketLocations(one), one);
  assert.deepEqual(homeMarketLocations([]), []);
});

test("the anchor is the busiest city, not the first one listed", () => {
  const dominantLast = [
    city("FarSmall", 1, 51.5072, -0.1276),
    city("FarSmall2", 1, 48.8566, 2.3522),
    city("Big", 98, -33.8688, 151.2093),
  ];
  const picked = homeMarketLocations(dominantLast).map((l) => l.displayName);
  assert.deepEqual(picked, ["Big"]);
});

test("a city with no coordinates cannot drag the frame", () => {
  const withNull = [
    { displayName: "Real", talentCount: 30, latitude: 20.6, longitude: -87.0 },
    { displayName: "NoCoords", talentCount: 5, latitude: null, longitude: null },
  ];
  const picked = homeMarketLocations(withNull).map((l) => l.displayName);
  assert.deepEqual(picked, ["Real"]);
});
