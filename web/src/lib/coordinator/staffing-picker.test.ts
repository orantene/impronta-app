import assert from "node:assert/strict";
import test from "node:test";

import { rankCandidates, type StaffCandidate } from "./staffing-picker";

const c = (over: Partial<StaffCandidate>): StaffCandidate => ({
  id: "a",
  name: "Ana",
  available: true,
  priceCents: 10000,
  rating: 4.5,
  distanceKm: 5,
  ...over,
});

const pool: StaffCandidate[] = [
  c({ id: "a", name: "Ana", priceCents: 12000, rating: 4.9, distanceKm: 10 }),
  c({ id: "b", name: "Beto", priceCents: 8000, rating: 4.2, distanceKm: 3 }),
  c({ id: "c", name: "Cris", available: false, priceCents: 5000, rating: 5, distanceKm: 1 }),
  c({ id: "d", name: "Dana", available: null, priceCents: 9000, rating: null, distanceKm: null }),
];

test("by default only people free for the dates are offered; unknown availability is not 'free'", () => {
  assert.deepEqual(rankCandidates(pool, {}).map((r) => r.id), ["a", "b"]);
});

test("the coordinator may include people with unknown or no availability, listed after the free ones, flagged", () => {
  const out = rankCandidates(pool, { includeUnavailable: true });
  assert.deepEqual(out.map((r) => r.id).slice(0, 2).sort(), ["a", "b"]);
  assert.deepEqual(out.map((r) => [r.id, r.availability]).slice(2).sort(), [["c", "busy"], ["d", "unknown"]]);
});

test("price, rating and distance filters: a missing value never passes a filter that asks for it", () => {
  assert.deepEqual(rankCandidates(pool, { includeUnavailable: true, maxPriceCents: 9000 }).map((r) => r.id).sort(), ["b", "c", "d"]);
  assert.deepEqual(rankCandidates(pool, { includeUnavailable: true, minRating: 4.5 }).map((r) => r.id).sort(), ["a", "c"]);
  assert.deepEqual(rankCandidates(pool, { includeUnavailable: true, maxDistanceKm: 5 }).map((r) => r.id).sort(), ["b", "c"]);
});

test("ranking: best match first, a tie broken by name so the order is stable", () => {
  const out = rankCandidates([c({ id: "x", name: "Zed", priceCents: 10000, rating: 4, distanceKm: 5 }), c({ id: "y", name: "Abe", priceCents: 10000, rating: 4, distanceKm: 5 })], {});
  assert.deepEqual(out.map((r) => r.id), ["y", "x"]);
  // higher rating beats lower price when sorting by the default blend? rating weighs most
  const out2 = rankCandidates(pool.slice(0, 2), { sortBy: "rating" });
  assert.deepEqual(out2.map((r) => r.id), ["a", "b"]);
  assert.deepEqual(rankCandidates(pool.slice(0, 2), { sortBy: "price" }).map((r) => r.id), ["b", "a"]);
  assert.deepEqual(rankCandidates(pool.slice(0, 2), { sortBy: "distance" }).map((r) => r.id), ["b", "a"]);
});

test("a missing value sorts last on its own dimension", () => {
  const out = rankCandidates([c({ id: "n", name: "Nil", rating: null }), c({ id: "r", name: "Rey", rating: 3 })], { sortBy: "rating" });
  assert.deepEqual(out.map((r) => r.id), ["r", "n"]);
});

test("nothing in, nothing out; invalid filters are ignored not guessed", () => {
  assert.deepEqual(rankCandidates([], {}), []);
  assert.deepEqual(rankCandidates(pool, { maxPriceCents: Number.NaN }).map((r) => r.id), ["a", "b"]);
});
