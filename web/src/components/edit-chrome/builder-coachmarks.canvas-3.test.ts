/**
 * CANVAS-3 — CoachmarkId dismiss/persist tests for the 3 core-gesture tips.
 *
 * Runs via `npx tsx --test` (Node built-in test runner + tsx for TS support).
 * Uses a lightweight localStorage stub so there is no browser dependency.
 */

import test from "node:test";
import assert from "node:assert/strict";

// ── localStorage stub (synchronous, in-memory) ────────────────────────────
const store = new Map<string, string>();
const localStorageStub = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, value); },
  removeItem: (key: string) => { store.delete(key); },
  clear: () => { store.clear(); },
};

// Patch `window` and `localStorage` so the module's SSR guard (`typeof window
// === "undefined"`) passes and storage calls hit the stub.
(globalThis as Record<string, unknown>).window = globalThis;
(globalThis as Record<string, unknown>).localStorage = localStorageStub;

// Import AFTER patching so the module picks up the stub.
import {
  isCoachmarkDismissed,
  dismissCoachmark,
  nextUndismissedCoachmark,
  CANVAS_GESTURE_COACHMARK_SEQUENCE,
  type CoachmarkId,
} from "./builder-coachmarks";

// Reset storage between tests.
function reset() {
  store.clear();
}

// ── isCoachmarkDismissed ─────────────────────────────────────────────────────

test("isCoachmarkDismissed returns false when storage is empty", () => {
  reset();
  assert.equal(isCoachmarkDismissed("double-click-edit"), false);
  assert.equal(isCoachmarkDismissed("move-grip"), false);
  assert.equal(isCoachmarkDismissed("plus-line-insert"), false);
});

test("isCoachmarkDismissed returns false for an undismissed id", () => {
  reset();
  dismissCoachmark("double-click-edit");
  assert.equal(isCoachmarkDismissed("move-grip"), false);
  assert.equal(isCoachmarkDismissed("plus-line-insert"), false);
});

// ── dismissCoachmark + persist ───────────────────────────────────────────────

test("dismissCoachmark persists double-click-edit", () => {
  reset();
  assert.equal(isCoachmarkDismissed("double-click-edit"), false);
  dismissCoachmark("double-click-edit");
  assert.equal(isCoachmarkDismissed("double-click-edit"), true);
});

test("dismissCoachmark persists move-grip", () => {
  reset();
  dismissCoachmark("move-grip");
  assert.equal(isCoachmarkDismissed("move-grip"), true);
});

test("dismissCoachmark persists plus-line-insert", () => {
  reset();
  dismissCoachmark("plus-line-insert");
  assert.equal(isCoachmarkDismissed("plus-line-insert"), true);
});

test("dismissCoachmark is idempotent — dismissing twice does not corrupt storage", () => {
  reset();
  dismissCoachmark("double-click-edit");
  dismissCoachmark("double-click-edit");
  assert.equal(isCoachmarkDismissed("double-click-edit"), true);
  // Other ids should remain undismissed.
  assert.equal(isCoachmarkDismissed("move-grip"), false);
});

test("dismissCoachmark accumulates multiple ids without overwriting", () => {
  reset();
  dismissCoachmark("double-click-edit");
  dismissCoachmark("move-grip");
  assert.equal(isCoachmarkDismissed("double-click-edit"), true);
  assert.equal(isCoachmarkDismissed("move-grip"), true);
  assert.equal(isCoachmarkDismissed("plus-line-insert"), false);
});

// ── nextUndismissedCoachmark sequencing ─────────────────────────────────────

test("nextUndismissedCoachmark returns first id when none dismissed", () => {
  reset();
  assert.equal(
    nextUndismissedCoachmark(CANVAS_GESTURE_COACHMARK_SEQUENCE),
    "double-click-edit",
  );
});

test("nextUndismissedCoachmark returns move-grip after double-click-edit dismissed", () => {
  reset();
  dismissCoachmark("double-click-edit");
  assert.equal(
    nextUndismissedCoachmark(CANVAS_GESTURE_COACHMARK_SEQUENCE),
    "move-grip",
  );
});

test("nextUndismissedCoachmark returns plus-line-insert after first two dismissed", () => {
  reset();
  dismissCoachmark("double-click-edit");
  dismissCoachmark("move-grip");
  assert.equal(
    nextUndismissedCoachmark(CANVAS_GESTURE_COACHMARK_SEQUENCE),
    "plus-line-insert",
  );
});

test("nextUndismissedCoachmark returns null when all three dismissed", () => {
  reset();
  dismissCoachmark("double-click-edit");
  dismissCoachmark("move-grip");
  dismissCoachmark("plus-line-insert");
  assert.equal(
    nextUndismissedCoachmark(CANVAS_GESTURE_COACHMARK_SEQUENCE),
    null,
  );
});

test("nextUndismissedCoachmark with empty sequence always returns null", () => {
  reset();
  assert.equal(nextUndismissedCoachmark([]), null);
});

test("nextUndismissedCoachmark with a custom subsequence respects order", () => {
  reset();
  dismissCoachmark("move-grip");
  const sub: CoachmarkId[] = ["move-grip", "plus-line-insert"];
  // move-grip already dismissed → should surface plus-line-insert.
  assert.equal(nextUndismissedCoachmark(sub), "plus-line-insert");
});

// ── CANVAS_GESTURE_COACHMARK_SEQUENCE shape ──────────────────────────────────

test("CANVAS_GESTURE_COACHMARK_SEQUENCE contains exactly the 3 gesture ids in order", () => {
  reset();
  assert.deepEqual(Array.from(CANVAS_GESTURE_COACHMARK_SEQUENCE), [
    "double-click-edit",
    "move-grip",
    "plus-line-insert",
  ]);
});

// ── Pre-existing coachmark ids are unaffected ────────────────────────────────

test("existing coachmark ids (cmd-k-tip, etc.) still persist independently", () => {
  reset();
  dismissCoachmark("cmd-k-tip");
  dismissCoachmark("pin-workspace");
  assert.equal(isCoachmarkDismissed("cmd-k-tip"), true);
  assert.equal(isCoachmarkDismissed("pin-workspace"), true);
  assert.equal(isCoachmarkDismissed("double-click-edit"), false);
});
