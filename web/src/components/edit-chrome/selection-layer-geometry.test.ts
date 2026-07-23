import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AUTOSCROLL_BAND,
  AUTOSCROLL_MAX,
  autoscrollDeltaForY,
  filterMarqueeHits,
  marqueeRectFromPoints,
  rectsIntersect,
  resolveSectionDropTarget,
  type Rect,
  type SectionDropItem,
} from "./selection-layer-geometry";

// ── resolveSectionDropTarget ─────────────────────────────────────────────────

const items: SectionDropItem[] = [
  { id: "a", slotKey: "main", order: 0, top: 0, bottom: 100, left: 10, width: 200 },
  { id: "b", slotKey: "main", order: 1, top: 100, bottom: 200, left: 10, width: 200 },
  { id: "c", slotKey: "main", order: 2, top: 200, bottom: 300, left: 10, width: 200 },
];

test("resolveSectionDropTarget: empty list → null", () => {
  assert.equal(resolveSectionDropTarget([], 50, "main", () => true), null);
});

test("resolveSectionDropTarget: cursor in a section's top half inserts before it", () => {
  // b spans 100..200, midpoint 150; cursor 120 < 150 → insert before b (index 1)
  const drop = resolveSectionDropTarget(items, 120, "main", () => true);
  assert.ok(drop);
  assert.equal(drop.slotKey, "main");
  assert.equal(drop.sortOrder, 1);
  assert.equal(drop.indicatorY, 100); // b.top
  assert.equal(drop.indicatorLeft, 10);
  assert.equal(drop.indicatorWidth, 200);
  assert.equal(drop.allowed, true);
});

test("resolveSectionDropTarget: cursor in a section's bottom half inserts after it", () => {
  // b midpoint 150; cursor 180 > 150 → insert after b (index 2)
  const drop = resolveSectionDropTarget(items, 180, "main", () => true);
  assert.ok(drop);
  assert.equal(drop.sortOrder, 2);
  assert.equal(drop.indicatorY, 200); // b.bottom
});

test("resolveSectionDropTarget: picks the section whose midpoint is nearest", () => {
  // cursor 260 → nearest to c (mid 250) → bottom half → after c (index 3)
  const drop = resolveSectionDropTarget(items, 260, "main", () => true);
  assert.ok(drop);
  assert.equal(drop.sortOrder, 3);
});

test("resolveSectionDropTarget: same slot as source is always allowed", () => {
  const drop = resolveSectionDropTarget(items, 120, "main", () => false);
  assert.ok(drop);
  assert.equal(drop.allowed, true); // predicate not even consulted
});

test("resolveSectionDropTarget: cross-slot defers to the predicate", () => {
  const cross: SectionDropItem[] = [
    { id: "x", slotKey: "aside", order: 0, top: 0, bottom: 100, left: 0, width: 50 },
  ];
  const denied = resolveSectionDropTarget(cross, 40, "main", () => false);
  assert.ok(denied);
  assert.equal(denied.allowed, false);
  const allowed = resolveSectionDropTarget(cross, 40, "main", (slot) => slot === "aside");
  assert.ok(allowed);
  assert.equal(allowed.allowed, true);
});

test("resolveSectionDropTarget: sibling index is slot-local, not global", () => {
  const mixed: SectionDropItem[] = [
    { id: "h1", slotKey: "header", order: 0, top: 0, bottom: 50, left: 0, width: 10 },
    { id: "m1", slotKey: "main", order: 0, top: 50, bottom: 150, left: 0, width: 10 },
    { id: "m2", slotKey: "main", order: 1, top: 150, bottom: 250, left: 0, width: 10 },
  ];
  // cursor 60 → nearest m1 (mid 100)? distances: h1 mid 25 → 35; m1 mid 100 → 40.
  // h1 is nearest → top half? 60 > 25 → after h1 → header sibling idx 0 +1 = 1
  const drop = resolveSectionDropTarget(mixed, 60, "main", () => true);
  assert.ok(drop);
  assert.equal(drop.slotKey, "header");
  assert.equal(drop.sortOrder, 1);
});

// ── autoscrollDeltaForY ──────────────────────────────────────────────────────

test("autoscrollDeltaForY: no scroll in the dead zone", () => {
  assert.equal(autoscrollDeltaForY(400, 800), 0);
});

test("autoscrollDeltaForY: ramps negative (up) near the top edge", () => {
  // y=0 → full-strength up
  assert.equal(autoscrollDeltaForY(0, 800), -AUTOSCROLL_MAX);
  // y at band edge → 0
  assert.equal(autoscrollDeltaForY(AUTOSCROLL_BAND, 800), 0);
  // halfway into the band → half strength
  assert.equal(autoscrollDeltaForY(AUTOSCROLL_BAND / 2, 800), -AUTOSCROLL_MAX / 2);
});

test("autoscrollDeltaForY: ramps positive (down) near the bottom edge", () => {
  const vh = 800;
  assert.equal(autoscrollDeltaForY(vh, vh), AUTOSCROLL_MAX);
  assert.equal(autoscrollDeltaForY(vh - AUTOSCROLL_BAND, vh), 0);
  assert.equal(autoscrollDeltaForY(vh - AUTOSCROLL_BAND / 2, vh), AUTOSCROLL_MAX / 2);
});

test("autoscrollDeltaForY: honours custom band/max", () => {
  assert.equal(autoscrollDeltaForY(0, 800, 40, 20), -20);
  assert.equal(autoscrollDeltaForY(20, 800, 40, 20), -10);
});

// ── rectsIntersect + marqueeRectFromPoints ───────────────────────────────────

test("rectsIntersect: overlap vs disjoint", () => {
  const a: Rect = { top: 0, left: 0, width: 100, height: 100 };
  assert.equal(rectsIntersect(a, { top: 50, left: 50, width: 100, height: 100 }), true);
  assert.equal(rectsIntersect(a, { top: 200, left: 200, width: 10, height: 10 }), false);
  // edge-touching is exclusive (no overlap)
  assert.equal(rectsIntersect(a, { top: 0, left: 100, width: 10, height: 10 }), false);
});

test("marqueeRectFromPoints: normalizes any drag direction", () => {
  assert.deepEqual(marqueeRectFromPoints(10, 20, 40, 60), {
    left: 10, top: 20, width: 30, height: 40,
  });
  // dragged up-left → same normalized rect
  assert.deepEqual(marqueeRectFromPoints(40, 60, 10, 20), {
    left: 10, top: 20, width: 30, height: 40,
  });
});

// ── filterMarqueeHits ────────────────────────────────────────────────────────

interface Cand { id: string; box: Rect; parentOf: string[] }
const contains = (ancestor: Cand, descendant: Cand) =>
  ancestor.parentOf.includes(descendant.id);

test("filterMarqueeHits: keeps only intersecting candidates", () => {
  const rect: Rect = { top: 0, left: 0, width: 100, height: 100 };
  const cands: Cand[] = [
    { id: "in", box: { top: 10, left: 10, width: 20, height: 20 }, parentOf: [] },
    { id: "out", box: { top: 500, left: 500, width: 20, height: 20 }, parentOf: [] },
  ];
  const hits = filterMarqueeHits(rect, cands, contains).map((c) => c.id);
  assert.deepEqual(hits, ["in"]);
});

test("filterMarqueeHits: drops ancestors, keeps the innermost (deepest) hit", () => {
  const rect: Rect = { top: 0, left: 0, width: 300, height: 300 };
  const parent: Cand = { id: "p", box: { top: 0, left: 0, width: 200, height: 200 }, parentOf: ["c"] };
  const child: Cand = { id: "c", box: { top: 10, left: 10, width: 50, height: 50 }, parentOf: [] };
  const hits = filterMarqueeHits(rect, [parent, child], contains).map((c) => c.id);
  assert.deepEqual(hits, ["c"]);
});

test("filterMarqueeHits: keeps disjoint siblings both selected", () => {
  const rect: Rect = { top: 0, left: 0, width: 400, height: 400 };
  const s1: Cand = { id: "s1", box: { top: 0, left: 0, width: 50, height: 50 }, parentOf: [] };
  const s2: Cand = { id: "s2", box: { top: 100, left: 100, width: 50, height: 50 }, parentOf: [] };
  const hits = filterMarqueeHits(rect, [s1, s2], contains).map((c) => c.id);
  assert.deepEqual(hits.sort(), ["s1", "s2"]);
});
