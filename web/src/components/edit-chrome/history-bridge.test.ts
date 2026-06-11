import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getCanRedoSnapshot,
  getCanUndoSnapshot,
  getHistoryServerSnapshot,
  publishCanRedo,
  publishCanUndo,
  subscribeCanRedo,
  subscribeCanUndo,
} from "./history-bridge";

// WS2 — the history micro-store hoists canUndo/canRedo out of the EditProvider
// value-memo. SAFETY properties: each slice notifies independently (a redo-only
// reader is not woken by an undo change); an unchanged publish is a no-op; the
// server snapshot is deterministically false (nothing to undo/redo on first
// paint) so hydration matches.

test("server snapshot is always false (nothing to undo/redo on first paint)", () => {
  assert.equal(getHistoryServerSnapshot(), false);
});

test("publishing canUndo true notifies undo subscribers + updates the snapshot", () => {
  publishCanUndo(false); // reset
  let notifications = 0;
  const unsub = subscribeCanUndo(() => {
    notifications += 1;
  });
  publishCanUndo(true);
  assert.equal(notifications, 1);
  assert.equal(getCanUndoSnapshot(), true);
  unsub();
});

test("re-publishing the same canUndo value is a no-op (no notify)", () => {
  publishCanUndo(true);
  let notifications = 0;
  const unsub = subscribeCanUndo(() => {
    notifications += 1;
  });
  publishCanUndo(true); // unchanged
  assert.equal(notifications, 0);
  unsub();
});

test("undo and redo slices are independent (a redo change does not notify undo)", () => {
  publishCanUndo(false);
  publishCanRedo(false);
  let undoNotifications = 0;
  let redoNotifications = 0;
  const unsubUndo = subscribeCanUndo(() => {
    undoNotifications += 1;
  });
  const unsubRedo = subscribeCanRedo(() => {
    redoNotifications += 1;
  });
  publishCanRedo(true);
  assert.equal(redoNotifications, 1);
  assert.equal(undoNotifications, 0); // undo slice untouched
  assert.equal(getCanRedoSnapshot(), true);
  assert.equal(getCanUndoSnapshot(), false);
  unsubUndo();
  unsubRedo();
});
