/**
 * P7A-3 — Shared semantics for drag-reorder of builder-node siblings.
 *
 * Drop targets use a **gap index** between siblings: `0` is before the first
 * child, `length` is after the last. `moveBuilderNodeToParentIndex` expects a
 * **sibling index** after the node is logically removed from its current parent.
 *
 * Navigator child rows, canvas nested-blocks panel, and inspector child list
 * must all agree — keep the math in one place.
 */
export type SiblingDropGapToMoveIndexResult =
  | { kind: "noop" }
  | { kind: "move"; targetSiblingIndex: number };

export function siblingDropGapToMoveIndex(input: {
  /** Gap index (0 … childCount inclusive). */
  dropGapIndex: number;
  /** Current index of the dragged node among siblings under the source parent. */
  sourceSiblingIndex: number;
  /** False when moving across parents (no -1 adjustment for removal). */
  sameParent: boolean;
}): SiblingDropGapToMoveIndexResult {
  const { dropGapIndex, sourceSiblingIndex, sameParent } = input;
  if (
    sameParent &&
    (dropGapIndex === sourceSiblingIndex ||
      dropGapIndex === sourceSiblingIndex + 1)
  ) {
    return { kind: "noop" };
  }
  const targetSiblingIndex =
    sameParent && dropGapIndex > sourceSiblingIndex
      ? dropGapIndex - 1
      : dropGapIndex;
  if (targetSiblingIndex < 0) {
    return { kind: "noop" };
  }
  return { kind: "move", targetSiblingIndex };
}
