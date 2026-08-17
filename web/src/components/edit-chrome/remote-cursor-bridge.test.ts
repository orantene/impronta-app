import assert from "node:assert/strict";
import test from "node:test";

import {
  REMOTE_CURSOR_TTL_MS,
  getRemoteCursorsSnapshot,
  pruneStaleRemoteCursors,
  reconcileRemoteCursors,
  resetRemoteCursors,
  upsertRemoteCursor,
  type RemoteCursor,
} from "./remote-cursor-bridge";

/**
 * The other half of the owner's stuck border: "the border of selected section
 * gets stuck when another user is there in mobile and the other in desktop."
 *
 * A peer broadcasts their cursor + selection only WHILE their pointer moves.
 * Presence only reconciles on a real leave. So a peer who goes idle,
 * backgrounds the tab, or closes the laptop keeps a live presence row while
 * sending nothing — and their selection ring sat on your canvas indefinitely.
 *
 * `lastSeen` was recorded on every upsert since WS1-B and read by nothing.
 * These tests pin the sweep that finally reads it.
 */

function cursor(tabId: string, lastSeen: number): RemoteCursor {
  return {
    tabId,
    nodeId: "n1",
    fx: 0.5,
    fy: 0.5,
    name: "Peer",
    color: "#39f",
    selectedNodeId: "n1",
    lastSeen,
  };
}

test.beforeEach(() => resetRemoteCursors());

test("a peer who is still broadcasting is kept", () => {
  const now = 1_000_000;
  upsertRemoteCursor(cursor("a", now - 500));
  assert.equal(pruneStaleRemoteCursors(now), false);
  assert.equal(getRemoteCursorsSnapshot().size, 1);
});

test("a peer who stopped broadcasting is dropped once the TTL passes", () => {
  const now = 1_000_000;
  upsertRemoteCursor(cursor("idle", now - REMOTE_CURSOR_TTL_MS - 1));
  assert.equal(pruneStaleRemoteCursors(now), true);
  assert.equal(getRemoteCursorsSnapshot().size, 0);
});

test("the sweep drops only the stale peers", () => {
  const now = 1_000_000;
  upsertRemoteCursor(cursor("live", now - 100));
  upsertRemoteCursor(cursor("idle", now - REMOTE_CURSOR_TTL_MS - 1));
  pruneStaleRemoteCursors(now);
  const remaining = getRemoteCursorsSnapshot();
  assert.equal(remaining.size, 1);
  assert.ok(remaining.has("live"));
});

test("a peer exactly at the TTL boundary is kept", () => {
  // Strictly greater-than, so a broadcast that lands on the boundary is not
  // treated as a disappearance.
  const now = 1_000_000;
  upsertRemoteCursor(cursor("edge", now - REMOTE_CURSOR_TTL_MS));
  assert.equal(pruneStaleRemoteCursors(now), false);
  assert.equal(getRemoteCursorsSnapshot().size, 1);
});

test("the sweep notifies subscribers only when it actually pruned", () => {
  // The sweep runs on an interval; emitting every 2s with nothing to do would
  // re-render the overlay forever.
  const now = 1_000_000;
  upsertRemoteCursor(cursor("live", now));
  assert.equal(pruneStaleRemoteCursors(now), false);
  upsertRemoteCursor(cursor("idle", now - REMOTE_CURSOR_TTL_MS - 1));
  assert.equal(pruneStaleRemoteCursors(now), true);
  assert.equal(pruneStaleRemoteCursors(now), false);
});

test("presence reconcile still removes a peer who really left", () => {
  // The TTL is an ADDITION, not a replacement: an explicit leave must stay
  // instant rather than waiting out the timeout.
  upsertRemoteCursor(cursor("gone", Date.now()));
  reconcileRemoteCursors(new Set<string>());
  assert.equal(getRemoteCursorsSnapshot().size, 0);
});
