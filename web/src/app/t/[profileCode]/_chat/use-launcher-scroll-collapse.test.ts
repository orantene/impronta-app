import assert from "node:assert/strict";
import { test } from "node:test";

import { decideCollapse } from "./use-launcher-scroll-collapse";

test("scrolling down past the top zone collapses the pill", () => {
  assert.deepEqual(decideCollapse(600, 400), {
    kind: "set",
    collapsed: true,
    lastY: 600,
  });
});

test("scrolling back up re-expands it — the visitor is hunting for an action", () => {
  assert.deepEqual(decideCollapse(400, 600), {
    kind: "set",
    collapsed: false,
    lastY: 400,
  });
});

test("near the top it is always expanded, whatever the direction", () => {
  assert.deepEqual(decideCollapse(0, 900), {
    kind: "set",
    collapsed: false,
    lastY: 0,
  });
  assert.deepEqual(decideCollapse(80, 10), {
    kind: "set",
    collapsed: false,
    lastY: 80,
  });
});

test("sub-threshold jitter never flips state (no flicker while reading)", () => {
  assert.deepEqual(decideCollapse(620, 600), { kind: "unchanged" });
  assert.deepEqual(decideCollapse(580, 600), { kind: "unchanged" });
});

test("lastY only advances on a real decision, so small scrolls accumulate", () => {
  // small nudges are ignored while the anchor stays put...
  const lastY = 600;
  for (const y of [605, 612, 620]) {
    assert.equal(decideCollapse(y, lastY).kind, "unchanged");
  }
  // ...but the cumulative move from the anchor eventually crosses it
  const d = decideCollapse(630, lastY);
  assert.deepEqual(d, { kind: "set", collapsed: true, lastY: 630 });
});
