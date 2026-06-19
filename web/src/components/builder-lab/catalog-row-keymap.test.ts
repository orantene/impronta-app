import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PRIMARY_SURFACE_FOR_KEY,
  keyToRowAction,
  actionNeedsFocusedRow,
  nextRowId,
  prevRowId,
  shouldIgnoreKeyForTarget,
} from "./catalog-row-keymap";

const IDS = ["a", "b", "c"];

// ── keyToRowAction ──────────────────────────────────────────────────────────

test("keyToRowAction: maps movement + action keys", () => {
  assert.deepEqual(keyToRowAction("j"), { type: "focus-next" });
  assert.deepEqual(keyToRowAction("k"), { type: "focus-prev" });
  assert.deepEqual(keyToRowAction("e"), { type: "edit" });
  assert.deepEqual(keyToRowAction("p"), { type: "preview" });
  assert.deepEqual(keyToRowAction("/"), { type: "focus-search" });
  assert.deepEqual(keyToRowAction("escape"), { type: "collapse" });
});

test("keyToRowAction: t/w map to the two PRIMARY surfaces", () => {
  assert.deepEqual(keyToRowAction("t"), {
    type: "toggle-surface",
    surface: "talent_profile",
  });
  assert.deepEqual(keyToRowAction("w"), {
    type: "toggle-surface",
    surface: "workspace_page",
  });
  // documented intent: t→talent profile, w→workspace page
  assert.equal(PRIMARY_SURFACE_FOR_KEY.t, "talent_profile");
  assert.equal(PRIMARY_SURFACE_FOR_KEY.w, "workspace_page");
});

test("keyToRowAction: unknown keys produce null", () => {
  assert.equal(keyToRowAction("x"), null);
  assert.equal(keyToRowAction("enter"), null);
  assert.equal(keyToRowAction(""), null);
  assert.equal(keyToRowAction("arrowdown"), null);
});

// ── actionNeedsFocusedRow ─────────────────────────────────────────────────────

test("actionNeedsFocusedRow: edit/preview/toggle need a row; movement + global don't", () => {
  assert.equal(actionNeedsFocusedRow({ type: "edit" }), true);
  assert.equal(actionNeedsFocusedRow({ type: "preview" }), true);
  assert.equal(
    actionNeedsFocusedRow({ type: "toggle-surface", surface: "talent_profile" }),
    true,
  );
  assert.equal(actionNeedsFocusedRow({ type: "focus-next" }), false);
  assert.equal(actionNeedsFocusedRow({ type: "focus-prev" }), false);
  assert.equal(actionNeedsFocusedRow({ type: "focus-search" }), false);
  assert.equal(actionNeedsFocusedRow({ type: "collapse" }), false);
});

// ── nextRowId (j) ─────────────────────────────────────────────────────────────

test("nextRowId: empty list → null", () => {
  assert.equal(nextRowId(null, []), null);
  assert.equal(nextRowId("a", []), null);
});

test("nextRowId: no focus → first row (enter at top)", () => {
  assert.equal(nextRowId(null, IDS), "a");
});

test("nextRowId: focus not in list → first row", () => {
  assert.equal(nextRowId("zzz", IDS), "a");
});

test("nextRowId: advances to the following row", () => {
  assert.equal(nextRowId("a", IDS), "b");
  assert.equal(nextRowId("b", IDS), "c");
});

test("nextRowId: clamps at the last row (no wrap)", () => {
  assert.equal(nextRowId("c", IDS), "c");
});

// ── prevRowId (k) ─────────────────────────────────────────────────────────────

test("prevRowId: empty list → null", () => {
  assert.equal(prevRowId(null, []), null);
  assert.equal(prevRowId("a", []), null);
});

test("prevRowId: no focus → last row (enter at bottom)", () => {
  assert.equal(prevRowId(null, IDS), "c");
});

test("prevRowId: focus not in list → first row", () => {
  assert.equal(prevRowId("zzz", IDS), "a");
});

test("prevRowId: steps back to the preceding row", () => {
  assert.equal(prevRowId("c", IDS), "b");
  assert.equal(prevRowId("b", IDS), "a");
});

test("prevRowId: clamps at the first row (no wrap)", () => {
  assert.equal(prevRowId("a", IDS), "a");
});

test("next/prev round-trip from a middle row returns to itself", () => {
  assert.equal(prevRowId(nextRowId("b", IDS), IDS), "b");
  assert.equal(nextRowId(prevRowId("b", IDS), IDS), "b");
});

// ── shouldIgnoreKeyForTarget ──────────────────────────────────────────────────

test("shouldIgnoreKeyForTarget: ignores chords while typing in a form control", () => {
  assert.equal(shouldIgnoreKeyForTarget("j", "input"), true);
  assert.equal(shouldIgnoreKeyForTarget("e", "textarea"), true);
  assert.equal(shouldIgnoreKeyForTarget("t", "select"), true);
});

test("shouldIgnoreKeyForTarget: fires on non-form targets", () => {
  assert.equal(shouldIgnoreKeyForTarget("j", "div"), false);
  assert.equal(shouldIgnoreKeyForTarget("k", "td"), false);
  assert.equal(shouldIgnoreKeyForTarget("e", ""), false);
});

test("shouldIgnoreKeyForTarget: '/' ALWAYS reaches search, even from an input", () => {
  assert.equal(shouldIgnoreKeyForTarget("/", "input"), false);
  assert.equal(shouldIgnoreKeyForTarget("/", "textarea"), false);
  assert.equal(shouldIgnoreKeyForTarget("/", "div"), false);
});
