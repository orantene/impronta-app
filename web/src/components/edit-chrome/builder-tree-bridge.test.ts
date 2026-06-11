import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getBuilderTreeServerSnapshot,
  getBuilderTreeSnapshot,
  publishBuilderTree,
  subscribeBuilderTree,
} from "./builder-tree-bridge";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

// WS2 — the builder-tree micro-store hoists the live tree out of the EditProvider
// value-memo. The SAFETY property: a new tree reference (a real edit) notifies
// subscribers; re-publishing the SAME reference is a no-op (no render). The
// server snapshot is a single shared empty-tree object so useSyncExternalStore
// never sees a fresh allocation and never infinite-loops.

const tree = (n: number): BuilderNodeTree =>
  // The store treats the tree opaquely (reference identity only); a length-N
  // array is enough to assert "a real new reference notifies".
  Array.from({ length: n }, () => ({})) as unknown as BuilderNodeTree;

test("server snapshot is the SAME empty-tree reference every call (no per-call alloc)", () => {
  assert.strictEqual(
    getBuilderTreeServerSnapshot(),
    getBuilderTreeServerSnapshot(),
  );
});

test("publishing a new tree reference notifies subscribers + updates the snapshot", () => {
  let notifications = 0;
  const unsub = subscribeBuilderTree(() => {
    notifications += 1;
  });
  const next = tree(2);
  publishBuilderTree(next);
  assert.equal(notifications, 1);
  assert.strictEqual(getBuilderTreeSnapshot(), next);
  unsub();
});

test("re-publishing the identical reference is a no-op (no notify)", () => {
  const next = tree(3);
  publishBuilderTree(next);
  let notifications = 0;
  const unsub = subscribeBuilderTree(() => {
    notifications += 1;
  });
  publishBuilderTree(next); // same ref
  assert.equal(notifications, 0);
  assert.strictEqual(getBuilderTreeSnapshot(), next);
  unsub();
});

test("unsubscribed listeners are not notified", () => {
  let notifications = 0;
  const unsub = subscribeBuilderTree(() => {
    notifications += 1;
  });
  unsub();
  publishBuilderTree(tree(4));
  assert.equal(notifications, 0);
});
