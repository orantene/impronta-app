import assert from "node:assert/strict";
import { test } from "node:test";

import type { CityCluster } from "./map-clusters";
import { groupClustersForZoom } from "./map-zoom-clusters";

function city(key: string, lat: number, lng: number, count: number): CityCluster {
  return {
    key,
    lat,
    lng,
    label: key,
    // Only the length is read by the grouping.
    items: Array.from({ length: count }, () => ({}) as CityCluster["items"][number]),
  };
}

// Real Impronta roster geography.
const PLAYA = city("playa", 20.6296, -87.0739, 34);
const TULUM = city("tulum", 20.2114, -87.4654, 1);
const CANCUN = city("cancun", 21.1619, -86.8515, 2);
const BUENOS_AIRES = city("ba", -34.6037, -58.3816, 2);

test("zoomed out, neighbouring cities merge into one bubble", () => {
  const groups = groupClustersForZoom([PLAYA, TULUM, CANCUN, BUENOS_AIRES], 4);
  const rivieraBubble = groups.find((g) => g.cities.some((c) => c.key === "playa"));
  assert.ok(rivieraBubble, "expected a bubble containing Playa");
  assert.ok(
    rivieraBubble.cities.length > 1,
    "Playa/Tulum/Cancún should merge at country zoom",
  );
  // Buenos Aires is ~6,800km away and must never merge with them.
  const ba = groups.find((g) => g.cities.some((c) => c.key === "ba"));
  assert.equal(ba?.cities.length, 1);
});

test("zoomed in, each city separates into its own pin", () => {
  const groups = groupClustersForZoom([PLAYA, TULUM, CANCUN, BUENOS_AIRES], 12);
  assert.equal(groups.length, 4);
  assert.ok(groups.every((g) => g.cities.length === 1));
});

test("counts are preserved across every zoom level", () => {
  const all = [PLAYA, TULUM, CANCUN, BUENOS_AIRES];
  const expected = 34 + 1 + 2 + 2;
  for (const zoom of [1, 3, 5, 8, 12, 16]) {
    const total = groupClustersForZoom(all, zoom).reduce((n, g) => n + g.count, 0);
    assert.equal(total, expected, `talent lost or duplicated at zoom ${zoom}`);
  }
});

test("a merged bubble is weighted toward the densest member", () => {
  const [group] = groupClustersForZoom([PLAYA, TULUM], 4);
  assert.ok(group);
  assert.equal(group.cities.length, 2);
  // 34 in Playa vs 1 in Tulum → the bubble sits far nearer Playa.
  assert.ok(
    Math.abs(group.lat - PLAYA.lat) < Math.abs(group.lat - TULUM.lat),
    "bubble should sit nearer the city holding most talent",
  );
});

test("grouping is order-independent", () => {
  const a = groupClustersForZoom([PLAYA, TULUM, CANCUN, BUENOS_AIRES], 5)
    .map((g) => g.key)
    .sort();
  const b = groupClustersForZoom([BUENOS_AIRES, CANCUN, TULUM, PLAYA], 5)
    .map((g) => g.key)
    .sort();
  assert.deepEqual(a, b);
});

test("a single city passes through untouched", () => {
  const groups = groupClustersForZoom([PLAYA], 3);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]!.count, 34);
  assert.equal(groups[0]!.lat, PLAYA.lat);
});
