/**
 * selection.test.ts — the media library's selection model.
 *
 * This is the behaviour every picker call site depends on and the one that a
 * screenshot cannot show: whether clicking a tile picks-and-closes, toggles,
 * or does nothing. Pure functions, so it is a real test rather than a mocked
 * render.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  activateSelection,
  addToSelection,
  EMPTY_SELECTION,
  isSelected,
  toggleSelection,
} from "./selection";

const A = { id: "a", publicUrl: "https://cdn.test/a.jpg" };
const B = { id: "b", publicUrl: "https://cdn.test/b.jpg" };

test("[selection] mode 'none' makes tiles inert", () => {
  assert.deepEqual(activateSelection("none", EMPTY_SELECTION, A), { kind: "noop" });
});

test("[selection] mode 'single' commits immediately and holds nothing", () => {
  const outcome = activateSelection("single", EMPTY_SELECTION, A);
  assert.deepEqual(outcome, { kind: "commit", id: "a", url: A.publicUrl });
  // Activating a second asset commits that one — it does not accumulate.
  assert.deepEqual(activateSelection("single", EMPTY_SELECTION, B), {
    kind: "commit",
    id: "b",
    url: B.publicUrl,
  });
});

test("[selection] mode 'multi' toggles, and preserves the order assets were added", () => {
  let state = EMPTY_SELECTION;
  for (const asset of [A, B]) {
    const outcome = activateSelection("multi", state, asset);
    assert.equal(outcome.kind, "pending");
    if (outcome.kind === "pending") state = outcome.state;
  }
  assert.deepEqual(state.ids, ["a", "b"]);
  assert.deepEqual(state.urls, [A.publicUrl, B.publicUrl]);

  // Toggling A off leaves B, still in order.
  const off = activateSelection("multi", state, A);
  assert.equal(off.kind, "pending");
  if (off.kind === "pending") {
    assert.deepEqual(off.state.ids, ["b"]);
    assert.deepEqual(off.state.urls, [B.publicUrl]);
  }
});

test("[selection] toggling is keyed on ID, not URL", () => {
  // Two library rows CAN resolve to the same public URL — a derivative that
  // was never re-uploaded, a re-registered object. A URL-keyed toggle would
  // deselect the wrong tile; the id is the primary key by construction.
  const twin = { id: "a-copy", publicUrl: A.publicUrl };
  let state = addToSelection(EMPTY_SELECTION, A);
  state = addToSelection(state, twin);
  assert.deepEqual(state.ids, ["a", "a-copy"]);

  state = toggleSelection(state, twin);
  assert.deepEqual(state.ids, ["a"], "only the twin came out");
  assert.deepEqual(state.urls, [A.publicUrl], "its URL slot came out with it");
});

test("[selection] addToSelection is idempotent (an upload landing twice)", () => {
  const once = addToSelection(EMPTY_SELECTION, A);
  const twice = addToSelection(once, A);
  assert.equal(twice, once, "the same state object is returned, so no re-render");
  assert.deepEqual(twice.ids, ["a"]);
});

test("[selection] isSelected reads the pending set", () => {
  const state = addToSelection(EMPTY_SELECTION, A);
  assert.equal(isSelected(state, "a"), true);
  assert.equal(isSelected(state, "b"), false);
});
