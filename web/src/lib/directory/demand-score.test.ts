import assert from "node:assert/strict";
import { test } from "node:test";

import { applyDemandSmoothing } from "./demand-score";

test("featured block pinned; tail ordered by score desc, ties stable", () => {
  const items = [
    { id: "f1", isFeatured: true },
    { id: "f2", isFeatured: true },
    { id: "a", isFeatured: false },
    { id: "b", isFeatured: false },
    { id: "c", isFeatured: false },
    { id: "d", isFeatured: false },
  ];
  applyDemandSmoothing(
    items,
    new Map([
      ["c", 9],
      ["b", 3],
      // score on a featured row must NOT reorder the featured block
      ["f2", 100],
    ]),
  );
  assert.deepEqual(
    items.map((i) => i.id),
    ["f1", "f2", "c", "b", "a", "d"],
  );
});

test("no scores → order untouched", () => {
  const items = [
    { id: "a", isFeatured: false },
    { id: "b", isFeatured: false },
  ];
  applyDemandSmoothing(items, new Map());
  assert.deepEqual(
    items.map((i) => i.id),
    ["a", "b"],
  );
});

test("all-featured page untouched", () => {
  const items = [
    { id: "f1", isFeatured: true },
    { id: "f2", isFeatured: true },
  ];
  applyDemandSmoothing(items, new Map([["f1", 1]]));
  assert.deepEqual(
    items.map((i) => i.id),
    ["f1", "f2"],
  );
});

test("manually curated rows keep their slots; demand reorders only uncurated", () => {
  const items = [
    { id: "r1", isFeatured: false, manualRankOverride: 1 },
    { id: "a", isFeatured: false, manualRankOverride: null },
    { id: "r2", isFeatured: false, manualRankOverride: 2 },
    { id: "b", isFeatured: false, manualRankOverride: null },
    { id: "c", isFeatured: false, manualRankOverride: null },
  ];
  applyDemandSmoothing(
    items,
    new Map([
      // huge demand on a curated row must NOT move it
      ["r2", 100],
      ["c", 9],
      ["b", 3],
    ]),
  );
  assert.deepEqual(
    items.map((i) => i.id),
    ["r1", "c", "r2", "b", "a"],
  );
});

test("fully curated page is untouched by demand", () => {
  const items = [
    { id: "r1", isFeatured: false, manualRankOverride: 1 },
    { id: "r2", isFeatured: false, manualRankOverride: 2 },
    { id: "r3", isFeatured: false, manualRankOverride: 3 },
  ];
  applyDemandSmoothing(items, new Map([["r3", 50]]));
  assert.deepEqual(
    items.map((i) => i.id),
    ["r1", "r2", "r3"],
  );
});
