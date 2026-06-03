import assert from "node:assert/strict";
import { test } from "node:test";

import {
  resolveCanvasNodeDrop,
  type CanvasDropCandidate,
} from "./canvas-node-drop";

/**
 * A container at (0,0) 400×300 holding three stacked 60px-tall child rows.
 * row 0: y 0–60 (mid 30) · row 1: y 60–120 (mid 90) · row 2: y 120–180 (mid 150)
 */
function stackContainer(
  overrides: Partial<CanvasDropCandidate> = {},
): CanvasDropCandidate {
  return {
    nodeId: "container-1",
    kind: "container",
    rect: { top: 0, left: 0, width: 400, height: 300 },
    depth: 0,
    locked: false,
    children: [
      { nodeId: "child-0", top: 0, bottom: 60 },
      { nodeId: "child-1", top: 60, bottom: 120 },
      { nodeId: "child-2", top: 120, bottom: 180 },
    ],
    ...overrides,
  };
}

test("cursor above the first child's midpoint inserts at index 0", () => {
  const result = resolveCanvasNodeDrop({
    cursorX: 100,
    cursorY: 10,
    draggedKind: "heading",
    candidates: [stackContainer()],
  });
  assert.ok(result);
  assert.equal(result.parentNodeId, "container-1");
  assert.equal(result.index, 0);
  assert.equal(result.allowed, true);
  assert.equal(result.indicatorY, 0);
});

test("cursor in the middle band inserts between children", () => {
  const result = resolveCanvasNodeDrop({
    cursorX: 100,
    cursorY: 70, // below child-0 mid (30), above child-1 mid (90)
    draggedKind: "paragraph",
    candidates: [stackContainer()],
  });
  assert.ok(result);
  assert.equal(result.index, 1);
  assert.equal(result.indicatorY, 60);
});

test("cursor below the last child's midpoint appends at the end", () => {
  const result = resolveCanvasNodeDrop({
    cursorX: 100,
    cursorY: 175, // below child-2 mid (150)
    draggedKind: "paragraph",
    candidates: [stackContainer()],
  });
  assert.ok(result);
  assert.equal(result.index, 3);
  assert.equal(result.indicatorY, 180);
});

test("empty container drops at index 0 with the container's own band", () => {
  const result = resolveCanvasNodeDrop({
    cursorX: 100,
    cursorY: 50,
    draggedKind: "heading",
    candidates: [stackContainer({ children: [] })],
  });
  assert.ok(result);
  assert.equal(result.index, 0);
  assert.equal(result.indicatorY, 300); // container.top + height
});

test("innermost (deepest) container under the cursor wins", () => {
  const outer = stackContainer({
    nodeId: "outer",
    depth: 0,
    rect: { top: 0, left: 0, width: 400, height: 300 },
    children: [{ nodeId: "inner", top: 40, bottom: 200 }],
  });
  const inner: CanvasDropCandidate = {
    nodeId: "inner",
    kind: "card",
    depth: 1,
    locked: false,
    rect: { top: 40, left: 40, width: 200, height: 160 },
    children: [{ nodeId: "inner-child", top: 60, bottom: 120 }],
  };
  const result = resolveCanvasNodeDrop({
    cursorX: 100,
    cursorY: 100, // inside both, but inner is deeper
    draggedKind: "paragraph",
    candidates: [outer, inner],
  });
  assert.ok(result);
  assert.equal(result.parentNodeId, "inner");
});

test("locked containers are skipped as parents (fall back to an outer one)", () => {
  const outer = stackContainer({
    nodeId: "outer",
    depth: 0,
    children: [{ nodeId: "locked", top: 20, bottom: 200 }],
  });
  const lockedInner: CanvasDropCandidate = {
    nodeId: "locked",
    kind: "container",
    depth: 1,
    locked: true,
    rect: { top: 20, left: 20, width: 200, height: 180 },
    children: [],
  };
  const result = resolveCanvasNodeDrop({
    cursorX: 100,
    cursorY: 100,
    draggedKind: "heading",
    candidates: [outer, lockedInner],
  });
  assert.ok(result);
  assert.equal(result.parentNodeId, "outer");
});

test("disallowed child kind reports allowed:false but still resolves a target", () => {
  // A `tabs` container only accepts `tab_panel` children — a heading is illegal.
  const tabs: CanvasDropCandidate = {
    nodeId: "tabs-1",
    kind: "tabs",
    depth: 0,
    locked: false,
    rect: { top: 0, left: 0, width: 400, height: 200 },
    children: [{ nodeId: "panel-0", top: 0, bottom: 100 }],
  };
  const result = resolveCanvasNodeDrop({
    cursorX: 100,
    cursorY: 10,
    draggedKind: "heading",
    candidates: [tabs],
  });
  assert.ok(result);
  assert.equal(result.allowed, false);
});

test("excludeNodeId removes the dragged node as a parent and from sibling math", () => {
  // Dragging child-1 within its own parent: it must not count itself, so the
  // gap indices collapse to the two remaining siblings (child-0, child-2).
  const result = resolveCanvasNodeDrop({
    cursorX: 100,
    cursorY: 175, // below child-2 → append after the remaining siblings
    draggedKind: "paragraph",
    candidates: [stackContainer()],
    excludeNodeId: "child-1",
  });
  assert.ok(result);
  // siblings after exclusion = [child-0 (0–60), child-2 (120–180)] → length 2,
  // cursor below child-2 mid (150) → gap index 2.
  assert.equal(result.index, 2);
});

test("a node cannot be dropped into itself (excluded container returns the outer)", () => {
  const self: CanvasDropCandidate = {
    nodeId: "self",
    kind: "container",
    depth: 1,
    locked: false,
    rect: { top: 20, left: 20, width: 200, height: 180 },
    children: [],
  };
  const outer = stackContainer({
    nodeId: "outer",
    depth: 0,
    children: [{ nodeId: "self", top: 20, bottom: 200 }],
  });
  const result = resolveCanvasNodeDrop({
    cursorX: 100,
    cursorY: 100,
    draggedKind: "container",
    candidates: [outer, self],
    excludeNodeId: "self",
  });
  assert.ok(result);
  assert.equal(result.parentNodeId, "outer");
});

test("cursor outside every candidate resolves to null", () => {
  const result = resolveCanvasNodeDrop({
    cursorX: 9999,
    cursorY: 9999,
    draggedKind: "heading",
    candidates: [stackContainer()],
  });
  assert.equal(result, null);
});
