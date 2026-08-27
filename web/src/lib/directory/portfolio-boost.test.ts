/**
 * Pins the Portfolio (Max) priority-placement ordering rule in Discover.
 *
 * The point of these tests is the BOUNDARIES of the boost, not just that it
 * lifts a paying talent: featured curation, manual arrange order, and stability
 * of the untouched cohort are all guarantees the marketing promise must not
 * quietly break.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { applyPortfolioPlacementBoost } from "./portfolio-boost";

type Card = { id: string; isFeatured: boolean; manualRankOverride?: number | null };

function card(id: string, extra: Partial<Card> = {}): Card {
  return { id, isFeatured: false, manualRankOverride: null, ...extra };
}

const ids = (items: Card[]): string[] => items.map((c) => c.id);

test("Portfolio talents move ahead of non-Portfolio, stably", () => {
  const items = [card("a"), card("b"), card("c"), card("d")];
  applyPortfolioPlacementBoost(items, new Set(["c", "d"]));
  // c,d lift in their existing relative order; a,b follow in theirs.
  assert.deepEqual(ids(items), ["c", "d", "a", "b"]);
});

test("relative order INSIDE each tier group is preserved", () => {
  const items = [card("p1"), card("f1"), card("p2"), card("f2"), card("p3")];
  applyPortfolioPlacementBoost(items, new Set(["p1", "p2", "p3"]));
  assert.deepEqual(ids(items), ["p1", "p2", "p3", "f1", "f2"]);
});

test("the leading featured block is never disturbed", () => {
  const items = [
    card("feat1", { isFeatured: true }),
    card("feat2", { isFeatured: true }),
    card("a"),
    card("max"),
  ];
  applyPortfolioPlacementBoost(items, new Set(["max"]));
  assert.deepEqual(ids(items), ["feat1", "feat2", "max", "a"]);
});

test("a featured non-Portfolio card still outranks a Portfolio card", () => {
  const items = [card("feat", { isFeatured: true }), card("max")];
  applyPortfolioPlacementBoost(items, new Set(["max"]));
  assert.deepEqual(ids(items), ["feat", "max"]);
});

test("manually arranged rows keep their exact slot", () => {
  const items = [
    card("a"),
    card("pinned", { manualRankOverride: 2 }),
    card("max"),
  ];
  applyPortfolioPlacementBoost(items, new Set(["max"]));
  // `pinned` stays at index 1; only the eligible slots 0 and 2 swap.
  assert.deepEqual(ids(items), ["max", "pinned", "a"]);
});

test("a manually arranged Portfolio row is not lifted either — human order wins", () => {
  const items = [card("a"), card("b"), card("max", { manualRankOverride: 3 })];
  applyPortfolioPlacementBoost(items, new Set(["max"]));
  assert.deepEqual(ids(items), ["a", "b", "max"]);
});

test("nobody is dropped, duplicated, or hidden", () => {
  const items = [card("a"), card("b"), card("c"), card("d"), card("e")];
  const before = new Set(ids(items));
  applyPortfolioPlacementBoost(items, new Set(["d"]));
  assert.equal(items.length, 5);
  assert.deepEqual(new Set(ids(items)), before);
});

test("empty Portfolio set is a no-op", () => {
  const items = [card("a"), card("b"), card("c")];
  applyPortfolioPlacementBoost(items, new Set());
  assert.deepEqual(ids(items), ["a", "b", "c"]);
});

test("all-Portfolio page is a no-op (nothing to prioritise against)", () => {
  const items = [card("a"), card("b"), card("c")];
  applyPortfolioPlacementBoost(items, new Set(["a", "b", "c"]));
  assert.deepEqual(ids(items), ["a", "b", "c"]);
});

test("single eligible slot is a no-op", () => {
  const items = [card("feat", { isFeatured: true }), card("max")];
  applyPortfolioPlacementBoost(items, new Set(["max"]));
  assert.deepEqual(ids(items), ["feat", "max"]);
});

test("the boost is a permutation of the SAME page — no window change", () => {
  const page = [card("a"), card("b"), card("c"), card("d")];
  const originalLength = page.length;
  applyPortfolioPlacementBoost(page, new Set(["b"]));
  assert.equal(page.length, originalLength);
  assert.deepEqual(ids(page).slice().sort(), ["a", "b", "c", "d"]);
});
