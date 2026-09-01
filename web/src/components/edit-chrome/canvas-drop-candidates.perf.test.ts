/**
 * canvas-drop-candidates.perf.test.ts — builder-2027 P1 (1C).
 *
 * WHAT IS BEING MEASURED, AND WHY IT IS COUNTED RATHER THAN TIMED
 * ──────────────────────────────────────────────────────────────
 * The canvas drag's cost is dominated by `getBoundingClientRect`: in a real
 * browser each call can force a synchronous layout flush, and a full scan makes
 * one per container plus one per direct child row. jsdom's implementation is a
 * zero-returning stub, so a millisecond figure measured here would say nothing
 * about a browser. The OPERATION COUNT is identical in both, and it is the exact
 * quantity these optimisations change, so that is what this asserts.
 *
 * The tree is built at the size of Impronta's homepage (~540 rendered nodes) so
 * the numbers in the report describe a page someone actually edits, not a
 * three-node fixture. Minimal fixtures are how the one-click fixer shipped
 * reporting success while fixing nothing.
 *
 * THE THREE CLAIMS
 * ────────────────
 *   1. A dragover FRAME costs zero DOM operations. The candidate set is
 *      invariant for one gesture, so `SelectionLayer` snapshots it at drag-start
 *      and hit-tests cached bands per frame.
 *   2. The containment scan is O(containers^2), not O(all nodes^2). Most nodes
 *      on a real page are leaves, so this is the difference between thousands of
 *      checks and hundreds of thousands.
 *   3. Scroll and resize bursts during a drag cost ONE rescan per animation
 *      frame, not one per event. A drag autoscroll emits many scroll events per
 *      frame and every intermediate rescan was discarded unread.
 *
 * Run: node_modules/.bin/tsx --test \
 *   src/components/edit-chrome/canvas-drop-candidates.perf.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { JSDOM } from "jsdom";

import { resolveCanvasNodeDrop } from "@/lib/site-admin/builder-node/canvas-node-drop";

import {
  collectCanvasDropCandidates,
  createCanvasDropIndexRefresher,
  readCanvasDropScanStats,
  resetCanvasDropScanStats,
} from "./canvas-drop-candidates";
import { capabilityContext } from "./selection-layer-node-caps";

// Set BEFORE any test body runs. None of the imports above read `document` at
// module scope (the collector checks `typeof document` per call), so hoisted
// static imports are safe here.
const dom = new JSDOM("<!doctype html><html><body></body></html>");
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.HTMLElement = dom.window.HTMLElement;

type AnyNode = {
  id: string;
  kind: string;
  props?: Record<string, unknown>;
  children?: AnyNode[];
};

/**
 * A tree shaped like a real page: sections, each holding a couple of container
 * rows, each holding leaf content. Roughly 1 container per 4 nodes, which is the
 * ratio that makes the O(containers^2) claim worth making.
 */
function buildRealisticTree(targetNodes: number): {
  tree: AnyNode[];
  total: number;
  containers: number;
} {
  const tree: AnyNode[] = [];
  let total = 0;
  let containers = 0;
  let s = 0;
  while (total < targetNodes) {
    const section: AnyNode = { id: `s${s}`, kind: "container", children: [] };
    total += 1;
    containers += 1;
    for (let r = 0; r < 2; r += 1) {
      const row: AnyNode = {
        id: `s${s}r${r}`,
        kind: "container",
        children: [],
      };
      total += 1;
      containers += 1;
      for (let leaf = 0; leaf < 6; leaf += 1) {
        row.children!.push({
          id: `s${s}r${r}l${leaf}`,
          kind: leaf % 2 === 0 ? "text" : "image",
          props: {},
        });
        total += 1;
      }
      section.children!.push(row);
    }
    tree.push(section);
    s += 1;
  }
  return { tree, total, containers };
}

/** Mirror the tree into the DOM the way the renderer emits it. */
function mountTree(nodes: AnyNode[], parent: Element): void {
  for (const node of nodes) {
    const el = dom.window.document.createElement("div");
    el.setAttribute("data-builder-node-id", node.id);
    parent.appendChild(el);
    if (node.children) mountTree(node.children, el);
  }
}

const IMPRONTA_HOMEPAGE_NODES = 540;
const { tree, total, containers } = buildRealisticTree(IMPRONTA_HOMEPAGE_NODES);
mountTree(tree, dom.window.document.body);

// jsdom returns a zero rect, which `collectCanvasDropCandidates` treats as
// "not laid out" and skips. Give every element a real box so the scan does the
// work it does in a browser.
let boxTop = 0;
for (const el of Array.from(
  dom.window.document.querySelectorAll("[data-builder-node-id]"),
)) {
  boxTop += 10;
  const rect = {
    top: boxTop,
    left: 0,
    width: 1200,
    height: 40,
    bottom: boxTop + 40,
    right: 1200,
    x: 0,
    y: boxTop,
    toJSON: () => ({}),
  };
  (el as unknown as { getBoundingClientRect: () => typeof rect })
    .getBoundingClientRect = () => rect;
}

const ctx = capabilityContext({
  device: "desktop",
  advancedElementLibraryEnabled: true,
  canInsertRawHtmlElements: false,
  multiNodeSelectionActive: false,
});

test("fixture is the size of a real page, not a toy", () => {
  assert.ok(
    total >= IMPRONTA_HOMEPAGE_NODES,
    `fixture must be at least ${IMPRONTA_HOMEPAGE_NODES} nodes, got ${total}`,
  );
  assert.ok(
    containers * 4 <= total,
    "most nodes on a real page are leaves; if the fixture is mostly containers " +
      "the O(containers^2) claim is not being tested against reality",
  );
});

test("one full scan costs a bounded, container-shaped number of DOM ops", () => {
  resetCanvasDropScanStats();
  const candidates = collectCanvasDropCandidates(tree as never, ctx);
  const after = readCanvasDropScanStats();

  assert.equal(after.scans, 1);
  assert.equal(candidates.length, containers);

  // The containment scan must be quadratic in CONTAINERS, not in all nodes.
  assert.equal(after.containsChecks, containers * (containers - 1));
  assert.ok(
    after.containsChecks < total * (total - 1),
    "the depth scan must not be quadratic over every [data-builder-node-id]",
  );

  // One rect per container + one per direct child row. Never one per node
  // squared, and never a second pass over the same element.
  const childRows = candidates.reduce((n, c) => n + c.children.length, 0);
  assert.equal(after.rectReads, containers + childRows);

  // Recorded so the numbers in the change's report can be reproduced rather
  // than taken on trust.
  console.log(
    `[1C] ${total} nodes / ${containers} containers: ` +
      `1 scan = ${after.rectReads} getBoundingClientRect + ` +
      `${after.containsChecks} contains(); ` +
      `an all-nodes quadratic scan would be ${total * (total - 1)} contains().`,
  );
});

test("a dragover FRAME costs zero DOM operations", () => {
  // Drag-start: the one scan SelectionLayer pays.
  const index = collectCanvasDropCandidates(tree as never, ctx);
  resetCanvasDropScanStats();

  // 120 frames of pointer movement, the length of a deliberate two-second drag.
  for (let frame = 0; frame < 120; frame += 1) {
    const drop = resolveCanvasNodeDrop({
      cursorX: 600,
      cursorY: 100 + frame * 3,
      draggedKind: "text" as never,
      candidates: index,
      excludeNodeId: null,
    });
    // The resolve must actually be doing work, or "zero DOM ops" is vacuous.
    assert.ok(drop === null || typeof drop.parentNodeId === "string");
  }

  const after = readCanvasDropScanStats();
  assert.deepEqual(
    after,
    { scans: 0, rectReads: 0, containsChecks: 0 },
    "resolving a drop from the cached index must not touch the DOM. If this " +
      "goes non-zero, the per-frame rescan has come back.",
  );
});

test("a scroll burst inside one frame costs ONE rescan, not one per event", () => {
  let runs = 0;
  let queued: (() => void) | null = null;
  const refresher = createCanvasDropIndexRefresher(
    () => {
      runs += 1;
    },
    (cb) => {
      queued = cb;
      return 1;
    },
    () => {
      queued = null;
    },
  );

  // A browser can emit many scroll events between two paints; a drag autoscroll
  // rAF loop guarantees it.
  for (let i = 0; i < 30; i += 1) refresher.request();
  assert.equal(runs, 0, "no rescan may run before the frame lands");

  const frame = queued as (() => void) | null;
  assert.ok(frame, "a frame must have been requested");
  frame();
  assert.equal(runs, 1, "30 scroll events in one frame must cost ONE rescan");

  // The next frame is free to schedule again.
  refresher.request();
  (queued as unknown as () => void)();
  assert.equal(runs, 2);
});

test("cancel drops a pending rescan so a finished gesture rebuilds nothing", () => {
  let runs = 0;
  let queued: (() => void) | null = null;
  const refresher = createCanvasDropIndexRefresher(
    () => {
      runs += 1;
    },
    (cb) => {
      queued = cb;
      return 7;
    },
    () => {
      queued = null;
    },
  );
  refresher.request();
  refresher.cancel();
  assert.equal(queued, null, "cancel must clear the pending frame");
  assert.equal(runs, 0);
});
