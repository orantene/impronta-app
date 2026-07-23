import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CANVAS_BLOCK_MOVE_DRAG_THRESHOLD_PX,
  classifyCanvasBlockPointerGesture,
  pointerMovedPastThreshold,
  resolveCanvasNodeMoveIndex,
  type ClassifyCanvasBlockPointerGestureInput,
} from "./canvas-block-move-gesture";

// A pointerdown that SHOULD begin a move: primary button, live editor, an
// editable + unlocked selected block, the pointer directly on it, no chrome, no
// inline edit. Individual tests flip one field to prove each guard.
function moveDragInput(
  overrides: Partial<ClassifyCanvasBlockPointerGestureInput> = {},
): ClassifyCanvasBlockPointerGestureInput {
  return {
    button: 0,
    previewing: false,
    selectedNodeIsEditableBlock: true,
    selectedNodeIsLocked: false,
    pointerOnSelectedBlock: true,
    targetInEditChrome: false,
    targetInInlineEdit: false,
    ...overrides,
  };
}

test("classify: canonical drag on a selected block → move-drag", () => {
  assert.equal(classifyCanvasBlockPointerGesture(moveDragInput()), "move-drag");
});

test("classify: non-primary button is native (context menu / middle-click)", () => {
  assert.equal(
    classifyCanvasBlockPointerGesture(moveDragInput({ button: 2 })),
    "native",
  );
  assert.equal(
    classifyCanvasBlockPointerGesture(moveDragInput({ button: 1 })),
    "native",
  );
});

test("classify: previewing suppresses the move gesture", () => {
  assert.equal(
    classifyCanvasBlockPointerGesture(moveDragInput({ previewing: true })),
    "native",
  );
});

test("classify: a non-editable / role or section selection is native", () => {
  assert.equal(
    classifyCanvasBlockPointerGesture(
      moveDragInput({ selectedNodeIsEditableBlock: false }),
    ),
    "native",
  );
});

test("classify: a locked block cannot be moved", () => {
  assert.equal(
    classifyCanvasBlockPointerGesture(
      moveDragInput({ selectedNodeIsLocked: true }),
    ),
    "native",
  );
});

test("classify: pointerdown NOT on the selected block stays native (nested child click)", () => {
  assert.equal(
    classifyCanvasBlockPointerGesture(
      moveDragInput({ pointerOnSelectedBlock: false }),
    ),
    "native",
  );
});

test("classify: edit chrome (chip / handle / topbar) owns its own gesture", () => {
  assert.equal(
    classifyCanvasBlockPointerGesture(
      moveDragInput({ targetInEditChrome: true }),
    ),
    "native",
  );
});

test("classify: inline text editing keeps native text selection (no move)", () => {
  // The regression guard: while a block is being inline-edited (contenteditable),
  // a drag must select TEXT, not reorder the block.
  assert.equal(
    classifyCanvasBlockPointerGesture(
      moveDragInput({ targetInInlineEdit: true }),
    ),
    "native",
  );
});

test("threshold: below the threshold is a click, at/above is a drag", () => {
  const t = CANVAS_BLOCK_MOVE_DRAG_THRESHOLD_PX;
  assert.equal(pointerMovedPastThreshold(0, 0), false);
  assert.equal(pointerMovedPastThreshold(t - 1, 0), false);
  assert.equal(pointerMovedPastThreshold(0, t - 1), false);
  assert.equal(pointerMovedPastThreshold(t, 0), true);
  assert.equal(pointerMovedPastThreshold(0, t), true);
  assert.equal(pointerMovedPastThreshold(-t, 0), true, "negative axis counts");
  assert.equal(pointerMovedPastThreshold(1, 1, 3), false, "custom threshold");
  assert.equal(pointerMovedPastThreshold(3, 0, 3), true, "custom threshold");
});

test("move-index: cross-parent move passes the gap index through unchanged", () => {
  assert.equal(
    resolveCanvasNodeMoveIndex({
      location: { parentNodeId: "A", sourceSiblingIndex: 1 },
      dropParentNodeId: "B",
      dropIndex: 2,
    }),
    2,
  );
});

test("move-index: a null location (root node) passes through unchanged", () => {
  assert.equal(
    resolveCanvasNodeMoveIndex({
      location: null,
      dropParentNodeId: null,
      dropIndex: 3,
    }),
    3,
  );
});

test("move-index: same-parent move re-expands the gap and applies the −1 removal shift", () => {
  const location = { parentNodeId: "P", sourceSiblingIndex: 1 };
  // Node is at index 1 among [0,1,2,3]; the resolver measured a 3-sibling gap
  // list [0,1,2] (dragged node excluded).
  // gap 0 (before the first remaining sibling) → target index 0.
  assert.equal(
    resolveCanvasNodeMoveIndex({
      location,
      dropParentNodeId: "P",
      dropIndex: 0,
    }),
    0,
  );
  // gap 2 → re-expanded to 3, minus removal shift → target 2.
  assert.equal(
    resolveCanvasNodeMoveIndex({
      location,
      dropParentNodeId: "P",
      dropIndex: 2,
    }),
    2,
  );
  // gap 3 (append at the end) → target 3.
  assert.equal(
    resolveCanvasNodeMoveIndex({
      location,
      dropParentNodeId: "P",
      dropIndex: 3,
    }),
    3,
  );
});

test("move-index: dropping a block back into its own slot is a no-op (null)", () => {
  const location = { parentNodeId: "P", sourceSiblingIndex: 1 };
  // gap 1 → re-expanded to 2 == source+1 → noop.
  assert.equal(
    resolveCanvasNodeMoveIndex({
      location,
      dropParentNodeId: "P",
      dropIndex: 1,
    }),
    null,
  );
  // A node at index 0 dropped at gap 0 → re-expanded to 1 == source+1 → noop.
  assert.equal(
    resolveCanvasNodeMoveIndex({
      location: { parentNodeId: "P", sourceSiblingIndex: 0 },
      dropParentNodeId: "P",
      dropIndex: 0,
    }),
    null,
  );
});
