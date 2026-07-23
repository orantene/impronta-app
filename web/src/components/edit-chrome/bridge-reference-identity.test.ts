/**
 * bridge-reference-identity.test.ts — Marathon W0-T5(c).
 *
 * Pins the `client-builder-canvas-bridge.ts` reference-identity contract that
 * the instant-paint canvas (and any future Sub-step-E selector store) depends
 * on. The bridge uses `Object.is` so that:
 *   - publishing a NEW tree reference notifies subscribers (the canvas repaints),
 *   - publishing the SAME reference is a no-op (no needless re-render),
 *   - the snapshot getter returns the EXACT published reference (no clone — a
 *     clone-on-read would defeat the canvas's `Object.is(prev.node)` memo and
 *     could spin an infinite render loop).
 *
 * W2-T1 wraps `ClientBuilderCanvas` in `React.memo` and leans on the bridge to
 * force the tree re-render on emit; this contract is what makes that safe.
 *
 * Runner: node:test via `tsx --test` — pure module test of the singleton, no
 * DOM. The bridge is a process singleton, so each test seeds a known baseline
 * via a unique reference and asserts transitions relative to it (there is no
 * reset hook). Counts are read from per-test listeners.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";
import {
  getBuilderCanvasTreeSnapshot,
  publishBuilderCanvasTree,
  subscribeBuilderCanvasTree,
} from "./client-builder-canvas-bridge";

/** A throwaway one-node tree with a fresh object identity each call. */
function freshTree(label: string): BuilderNodeTree {
  return [
    { id: `node:${label}`, kind: "heading", props: { text: label, level: 2 } },
  ];
}

// Track unsubscribes so a test's listener can't leak into the next test and
// inflate another test's call count (the store is a process singleton).
const activeUnsubs: Array<() => void> = [];
function track(listener: () => void): void {
  activeUnsubs.push(subscribeBuilderCanvasTree(listener));
}
afterEach(() => {
  while (activeUnsubs.length) activeUnsubs.pop()?.();
});

describe("client-builder-canvas-bridge: reference identity (W0-T5c)", () => {
  it("publishBuilderCanvasTree fires listeners on a NEW reference", () => {
    let calls = 0;
    track(() => {
      calls += 1;
    });
    publishBuilderCanvasTree(freshTree("a-new-ref"));
    assert.equal(calls, 1);
  });

  it("publishBuilderCanvasTree does NOT fire when the SAME reference is re-published (Object.is)", () => {
    const tree = freshTree("same-ref");
    publishBuilderCanvasTree(tree); // seed it as current
    let calls = 0;
    track(() => {
      calls += 1;
    });
    publishBuilderCanvasTree(tree); // identical ref → skipped
    assert.equal(calls, 0);
  });

  it("publishBuilderCanvasTree FIRES on a structurally-equal but DISTINCT reference (strict ref equality, not deep equality)", () => {
    // Pins the contract that the bridge compares by reference, not by content.
    // A future "clone the tree on every render" regression would make every
    // publish a new ref and re-render constantly — this test documents that the
    // bridge itself does ref-equality, so the CALLER must preserve identity.
    publishBuilderCanvasTree(freshTree("structural")); // seed current
    let calls = 0;
    track(() => {
      calls += 1;
    });
    // Same structure, different object identity → must fire.
    publishBuilderCanvasTree(freshTree("structural"));
    assert.equal(calls, 1);
  });

  it("getBuilderCanvasTreeSnapshot returns the EXACT reference that was published (no clone on read)", () => {
    const tree = freshTree("exact-ref");
    publishBuilderCanvasTree(tree);
    assert.equal(getBuilderCanvasTreeSnapshot(), tree); // Object.is identity
  });

  it("subscribeBuilderCanvasTree's unsubscribe removes the listener", () => {
    let calls = 0;
    const unsub = subscribeBuilderCanvasTree(() => {
      calls += 1;
    });
    unsub();
    publishBuilderCanvasTree(freshTree("after-unsub"));
    assert.equal(calls, 0);
  });

  it("multiple listeners all fire on a single publish", () => {
    let a = 0;
    let b = 0;
    let c = 0;
    track(() => {
      a += 1;
    });
    track(() => {
      b += 1;
    });
    track(() => {
      c += 1;
    });
    publishBuilderCanvasTree(freshTree("multi"));
    assert.equal(a, 1);
    assert.equal(b, 1);
    assert.equal(c, 1);
  });
});
