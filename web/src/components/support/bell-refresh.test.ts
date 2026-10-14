import assert from "node:assert/strict";
import { test } from "node:test";

import { BELL_MIN_GAP_MS, createBellRefreshGate } from "./bell-refresh";

test("a hidden tab never refreshes", () => {
  const g = createBellRefreshGate();
  assert.equal(g.tick(1_000_000, false), false);
});

test("a visible tab refreshes, then waits out the minimum gap", () => {
  const g = createBellRefreshGate();
  assert.equal(g.tick(1_000_000, true), true);
  assert.equal(g.tick(1_000_000 + BELL_MIN_GAP_MS - 1, true), false);
  assert.equal(g.tick(1_000_000 + BELL_MIN_GAP_MS, true), true);
});

test("a hidden tick does not consume the gap", () => {
  const g = createBellRefreshGate();
  g.tick(1_000_000, true);
  g.tick(1_000_000 + BELL_MIN_GAP_MS, false);
  assert.equal(g.tick(1_000_000 + BELL_MIN_GAP_MS, true), true);
});
