/**
 * W1-L7 — canvas block move-drag gesture classification + drop-index resolution.
 *
 * Defect (P1): dragging a SELECTED text/block on the canvas did NOT move it. The
 * block body had no drag handler, so a pointer-drag fell through to the browser's
 * native text-range selection (and the transient selection stacked a second
 * "1 selected" toolbar on top of the block toolbar). The universal builder
 * gesture — drag = move/reorder the block — did the wrong thing.
 *
 * The fix drives a POINTER-based move drag from the selected block body, reusing
 * the existing `canvas-node-drop` drop-policy + `moveBuilderNodeToParentIndex`
 * commit path (same machinery the chip grip's native HTML5 drag already used).
 * This module is the pure, unit-testable core of that gesture:
 *
 *   1. `classifyCanvasBlockPointerGesture` — decide whether a pointerdown on the
 *      canvas should begin a block move-drag or be left to the browser's native
 *      behavior (text selection / inline-edit / a chrome handle's own handler).
 *   2. `pointerMovedPastThreshold` — the click-vs-drag threshold so a plain click
 *      (select) is never mistaken for a move.
 *   3. `resolveCanvasNodeMoveIndex` — turn the resolver's gap index into the
 *      post-removal sibling index `moveBuilderNodeToParentIndex` expects,
 *      applying the same-parent −1 adjustment. Extracted verbatim from the
 *      native-drop commit path in `selection-layer.tsx` so both paths agree.
 */

import { siblingDropGapToMoveIndex } from "./sibling-drop-gap";

/** The two outcomes of a pointerdown on the canvas over a (possibly) selected block. */
export type CanvasBlockPointerGesture =
  /** Begin a block move-drag (suppress native text selection; arm on threshold). */
  | "move-drag"
  /** Leave the browser's native behavior alone (text select / inline edit / handle). */
  | "native";

export interface ClassifyCanvasBlockPointerGestureInput {
  /** `PointerEvent.button` — only the primary (0) button starts a move. */
  button: number;
  /** True while the editor is in preview mode (chrome + gestures suppressed). */
  previewing: boolean;
  /** The current selection is an editable freeform block (not a section/role node). */
  selectedNodeIsEditableBlock: boolean;
  /** The selected block is locked — its structure/position is owned, so no move. */
  selectedNodeIsLocked: boolean;
  /**
   * The pointerdown landed DIRECTLY on the selected block: the nearest
   * `[data-builder-node-id]` ancestor of the event target IS the selected node.
   * (A pointerdown on a nested child node resolves to that child, not the
   * container, so it stays a plain click that selects the child.)
   */
  pointerOnSelectedBlock: boolean;
  /**
   * The event target sits inside edit chrome (topbar / drawer / overlay / the
   * selection chip / a direct-manipulation handle) — that chrome owns the
   * gesture, so we never hijack it.
   */
  targetInEditChrome: boolean;
  /**
   * The event target sits inside an active inline text editor (a contenteditable
   * region or the canvas-edit overlay). Text editing must keep native text
   * selection, so we never start a move there.
   */
  targetInInlineEdit: boolean;
}

/**
 * Decide whether a canvas pointerdown should begin a block move-drag.
 *
 * A move-drag requires ALL of: primary button, not previewing, an editable +
 * unlocked selected block, the pointer directly on that block, and the target
 * being neither edit chrome nor an active inline text editor. Everything else is
 * left to native behavior — crucially, an in-progress inline text edit keeps its
 * native text-range selection (double-click → contenteditable stays intact).
 */
export function classifyCanvasBlockPointerGesture(
  input: ClassifyCanvasBlockPointerGestureInput,
): CanvasBlockPointerGesture {
  if (input.button !== 0) return "native";
  if (input.previewing) return "native";
  if (!input.selectedNodeIsEditableBlock) return "native";
  if (input.selectedNodeIsLocked) return "native";
  if (!input.pointerOnSelectedBlock) return "native";
  if (input.targetInEditChrome) return "native";
  if (input.targetInInlineEdit) return "native";
  return "move-drag";
}

/** Pixels the pointer must travel before an armed pointerdown becomes a drag. */
export const CANVAS_BLOCK_MOVE_DRAG_THRESHOLD_PX = 4;

/**
 * True once the pointer has moved far enough from its down-point to count as a
 * drag rather than a click. Uses a per-axis (Chebyshev) test — matching the
 * feel of the existing section/marquee gestures — so a small jitter on press
 * never reorders a block.
 */
export function pointerMovedPastThreshold(
  dx: number,
  dy: number,
  threshold: number = CANVAS_BLOCK_MOVE_DRAG_THRESHOLD_PX,
): boolean {
  return Math.abs(dx) >= threshold || Math.abs(dy) >= threshold;
}

export interface CanvasNodeSourceLocation {
  parentNodeId: string;
  sourceSiblingIndex: number;
}

/**
 * Resolve the FINAL `moveBuilderNodeToParentIndex` sibling index for a canvas
 * move, given the dragged node's current location and the resolver's gap-index
 * drop.
 *
 * The `resolveCanvasNodeDrop` resolver measures the gap index against the
 * siblings WITHOUT the dragged node (it's excluded so a node can't count
 * itself). For a same-parent move we re-expand that gap to the full sibling list
 * (any gap at/after the source slot is shifted up by one) and feed it through
 * `siblingDropGapToMoveIndex` to apply the post-removal −1 adjustment; a no-op
 * (dropped back into its own slot) returns `null`. A cross-parent move passes
 * the gap index through unchanged.
 *
 * Mirrors the native-drop commit path in `selection-layer.tsx` exactly so the
 * pointer-driven move and the chip-grip native drag land a block in the same
 * place.
 */
export function resolveCanvasNodeMoveIndex(input: {
  location: CanvasNodeSourceLocation | null;
  dropParentNodeId: string | null;
  dropIndex: number;
}): number | null {
  const { location, dropParentNodeId, dropIndex } = input;
  const sameParent =
    location != null && location.parentNodeId === dropParentNodeId;
  if (!sameParent) return dropIndex;
  const gap = siblingDropGapToMoveIndex({
    dropGapIndex:
      dropIndex >= location.sourceSiblingIndex ? dropIndex + 1 : dropIndex,
    sourceSiblingIndex: location.sourceSiblingIndex,
    sameParent: true,
  });
  return gap.kind === "noop" ? null : gap.targetSiblingIndex;
}
