/**
 * CANVAS-5 — FreeformLayersTree flat-list drop resolver.
 *
 * The freeform layer tree is a FLAT, depth-indented list (Figma/Webflow style),
 * not a real tree. The navigator child-row drag works on already-grouped sibling
 * lists; the layer tree only has a flattened row stream. This pure resolver maps
 * a "hovered row + which half" hover signal back to a real {parentId, index}
 * move so the SAME EditContext chokepoint (`moveBuilderNodeToParentIndex`) used
 * by the navigator can be reused unchanged — no parallel move path.
 *
 * Convention mirrors the navigator child drag (navigator-panel.tsx onChildDragOver):
 * dropping on a row's UPPER half lands BEFORE it (gap = row.index); the LOWER half
 * lands AFTER it (gap = row.index + 1); both within that row's parent. The gap is
 * then run through the SHARED `siblingDropGapToMoveIndex` (post-removal −1 for a
 * same-parent move) — the identical helper the navigator + canvas + inspector use.
 *
 * Reparent happens implicitly: hovering a row inside a different container resolves
 * a target parent != the source parent. Kind-legality is enforced by the SHARED
 * `canDropBuilderNode` drop-policy and cycle/self guards mirror the server-side
 * `moveBuilderNode` checks so an optimistic update never gets rejected downstream.
 */

import { canDropBuilderNode } from "./drop-policy";
import { siblingDropGapToMoveIndex } from "./sibling-drop-gap";
import type { BuilderNodeKind } from "./types";

/** Minimal per-row shape the resolver needs (subset of the tree's LayerRow). */
export interface FreeformDropRow {
  id: string;
  kind: BuilderNodeKind;
  /** Parent container id; `null` when the row sits at the page root. */
  parentId: string | null;
  /** Parent container kind; `null` at the page root (drop-policy root rules). */
  parentKind: BuilderNodeKind | null;
  /** Whether the parent container is locked (governance — block reparent in). */
  parentLocked: boolean;
  /** Index of the row within its parent's child list. */
  index: number;
  /**
   * How many children the row itself holds. Only read for an `inside` drop
   * (the block appends to the end of the container), so it is optional for the
   * sibling drops every caller already made.
   */
  childCount?: number;
  /** Whether the row ITSELF is locked — governance blocks nesting into it. */
  locked?: boolean;
}

/**
 * Where the drop lands relative to the hovered row. `before`/`after` are the
 * original sibling drops; `inside` nests the dragged block into the hovered row
 * itself, which the flat layer list previously had no way to express — a block
 * could only ever become a sibling of a row that was ALREADY inside the target
 * container, so an empty or collapsed container was unreachable from the panel.
 */
export type FreeformDropZone = "before" | "inside" | "after";

export interface FreeformDropResolved {
  /** Destination parent for `moveBuilderNodeToParentIndex` (`null` = root). */
  targetParentId: string | null;
  /** Post-removal sibling index for `moveBuilderNodeToParentIndex`. */
  targetIndex: number;
}

export type FreeformDropResult =
  | { kind: "noop" }
  | { kind: "blocked"; reason: string }
  | ({ kind: "move" } & FreeformDropResolved);

/** True when `candidateId` is the dragged node or one of its descendants. */
function isSelfOrDescendant(
  candidateId: string | null,
  sourceId: string,
  descendantIds: ReadonlySet<string>,
): boolean {
  if (candidateId == null) return false;
  return candidateId === sourceId || descendantIds.has(candidateId);
}

/**
 * Resolve a layer-tree drop to a `moveBuilderNodeToParentIndex` call.
 *
 * @param sourceId          dragged node id
 * @param sourceKind        dragged node kind (drives the child-kind allow-list)
 * @param sourceParentId    dragged node's current parent (`null` at root)
 * @param sourceIndex       dragged node's index within its current parent
 * @param descendantIds     ids inside the dragged subtree (cycle guard)
 * @param targetRow         the hovered row (drop lands as its sibling)
 * @param onUpperHalf       true when cursor is on the row's top half (drop before)
 */
export function resolveFreeformLayerDrop(input: {
  sourceId: string;
  sourceKind: BuilderNodeKind;
  sourceParentId: string | null;
  sourceIndex: number;
  descendantIds: ReadonlySet<string>;
  targetRow: FreeformDropRow;
  onUpperHalf: boolean;
  /**
   * Three-way zone from the pointer split. Omitted → derived from
   * `onUpperHalf`, which is exactly the pre-nest behaviour, so every existing
   * caller keeps its result byte-for-byte.
   */
  zone?: FreeformDropZone;
}): FreeformDropResult {
  const {
    sourceId,
    sourceKind,
    sourceParentId,
    sourceIndex,
    descendantIds,
    targetRow,
    onUpperHalf,
  } = input;
  const zone: FreeformDropZone = input.zone ?? (onUpperHalf ? "before" : "after");

  // Dropping onto itself is a no-op, not a move.
  if (targetRow.id === sourceId) return { kind: "noop" };

  // ── nest INTO the hovered row ─────────────────────────────────────────────
  // The hovered row becomes the PARENT and the block appends to the end of its
  // children. Runs the same three guards as a sibling drop, but against the row
  // itself rather than against the row's parent.
  if (zone === "inside") {
    if (isSelfOrDescendant(targetRow.id, sourceId, descendantIds)) {
      return { kind: "blocked", reason: "Cannot move a block into itself." };
    }
    if (targetRow.locked) {
      return { kind: "blocked", reason: "This container is locked." };
    }
    const nestDecision = canDropBuilderNode({
      nodeKind: sourceKind,
      parentKind: targetRow.kind,
    });
    if (!nestDecision.ok) {
      return { kind: "blocked", reason: nestDecision.message };
    }
    const childCount = targetRow.childCount ?? 0;
    // Already the last child of this container → nothing would change.
    if (sourceParentId === targetRow.id && sourceIndex === childCount - 1) {
      return { kind: "noop" };
    }
    // Append. A same-parent re-nest removes the source first, so the end index
    // is one lower — the same post-removal adjustment the sibling path makes.
    return {
      kind: "move",
      targetParentId: targetRow.id,
      targetIndex:
        sourceParentId === targetRow.id ? childCount - 1 : childCount,
    };
  }

  const targetParentId = targetRow.parentId;

  // Cycle / self guards — mirror the server-side moveBuilderNode checks so an
  // optimistic update never lands and then gets rejected. You cannot reparent
  // a node into itself or into any node inside its own subtree.
  if (isSelfOrDescendant(targetParentId, sourceId, descendantIds)) {
    return { kind: "blocked", reason: "Cannot move a block into itself." };
  }

  // Governance — never reparent INTO a locked container (the locked parent owns
  // its child order). A same-parent reorder inside a locked parent is also
  // blocked because the lock froze that container's structure.
  if (targetRow.parentLocked) {
    return { kind: "blocked", reason: "This container is locked." };
  }

  // Child-kind legality via the SHARED drop policy (root rules when parent null).
  const decision = canDropBuilderNode({
    nodeKind: sourceKind,
    parentKind: targetRow.parentKind,
  });
  if (!decision.ok) {
    return { kind: "blocked", reason: decision.message };
  }

  // Before the row / after the row. Gap is within the target row's parent list.
  const dropGapIndex = zone === "before" ? targetRow.index : targetRow.index + 1;
  const sameParent = sourceParentId === targetParentId;

  const resolved = siblingDropGapToMoveIndex({
    dropGapIndex,
    sourceSiblingIndex: sourceIndex,
    sameParent,
  });
  if (resolved.kind === "noop") return { kind: "noop" };

  return {
    kind: "move",
    targetParentId,
    targetIndex: resolved.targetSiblingIndex,
  };
}
