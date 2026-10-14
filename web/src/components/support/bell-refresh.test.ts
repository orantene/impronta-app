import assert from "node:assert/strict";
import { test } from "node:test";

import { BELL_INSERT_MIN_GAP_MS, BELL_MIN_GAP_MS, createBellRefreshGate } from "./bell-refresh";

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

import { readFileSync } from "node:fs";

const src = readFileSync("src/components/support/bell-refresh.ts", "utf8");

test("the bell subscribes to the user's own user_notifications rows, filtered by user_id", () => {
  assert.match(src, /postgres_changes/);
  assert.match(src, /table: "user_notifications"/);
  assert.match(src, /event: "INSERT"/);
  assert.match(src, /filter: `user_id=eq\.\$\{/);
});

test("there is no interval poll, only focus as a fallback", () => {
  assert.doesNotMatch(src, /setInterval/);
  assert.match(src, /addEventListener\("focus"/);
});

test("an insert burst refreshes at most once per 10s", () => {
  assert.equal(BELL_INSERT_MIN_GAP_MS, 10_000);
  const g = createBellRefreshGate(BELL_INSERT_MIN_GAP_MS);
  assert.equal(g.tick(1_000_000, true), true);
  assert.equal(g.tick(1_005_000, true), false);
  assert.equal(g.tick(1_010_000, true), true);
});
