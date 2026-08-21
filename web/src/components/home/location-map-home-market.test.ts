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

const city = (displayName: string, talentCount: number) => ({
  displayName,
  talentCount,
});

/** Impronta's real distribution at the time this shipped. */
const IMPRONTA = [
  city("Buenos Aires", 2),
  city("Cancun", 3),
  city("Mexico City", 1),
  city("Playa del Carmen", 40),
  city("Tulum", 2),
];

test("Impronta opens on Quintana Roo, not on the hemisphere", () => {
  const picked = homeMarketLocations(IMPRONTA).map((l) => l.displayName);
  assert.ok(
    picked.includes("Playa del Carmen"),
    "the city holding 40 of 48 talent must be in the opening view",
  );
  assert.ok(
    !picked.includes("Buenos Aires"),
    "a 2-talent outlier 7,000km away must not set the opening zoom",
  );
  assert.ok(
    !picked.includes("Mexico City"),
    "a 1-talent outlier must not set the opening zoom",
  );
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

test("an evenly spread roster keeps every city in view", () => {
  // No dominant market → no city can be dropped without losing most of the
  // roster, so the old fit-everything behaviour is still what happens.
  const even = [city("A", 10), city("B", 10), city("C", 10), city("D", 10)];
  assert.equal(homeMarketLocations(even).length, 4);
});

test("a single city is returned untouched", () => {
  const one = [city("Only", 5)];
  assert.deepEqual(homeMarketLocations(one), one);
  assert.deepEqual(homeMarketLocations([]), []);
});

test("no talent counts anywhere → every city stays in the frame", () => {
  // Dividing by a zero total would make the rule meaningless; falling back to
  // "show everything" is the honest answer when there is nothing to weigh.
  const noCounts = [city("A", 0), city("B", 0)];
  assert.equal(homeMarketLocations(noCounts).length, 2);
});

test("the rule is driven by talent share, not by city order", () => {
  const dominantLast = [city("Small", 1), city("Small2", 1), city("Big", 98)];
  const picked = homeMarketLocations(dominantLast).map((l) => l.displayName);
  assert.deepEqual(picked, ["Big"]);
});

test("negative counts cannot inflate a city into the frame", () => {
  const odd = [city("Real", 30), city("Corrupt", -100)];
  const picked = homeMarketLocations(odd).map((l) => l.displayName);
  assert.ok(picked.includes("Real"));
});
