/**
 * Pure capability resolvers for the canvas right-click menu.
 *
 * Extracted out of `selection-layer.tsx` (size ratchet, zero headroom) so the
 * section-unlock work could land there without pushing the file past budget.
 * These were already plain tree/props reads with no component state; moving
 * them out makes them unit-reachable and keeps the menu component
 * presentational.
 */

import type { BuilderNode } from "@/lib/site-admin/builder-node";

export interface NodeMoveContext {
  canMoveUp: boolean;
  canMoveDown: boolean;
}

const NO_MOVE: NodeMoveContext = { canMoveUp: false, canMoveDown: false };

/**
 * Can this node move within its own sibling list? Resolved from the node's
 * path (root -> ... -> node), so a node with no parent never offers the rows.
 */
export function resolveNodeMoveContext(
  node: BuilderNode | null | undefined,
  path: ReadonlyArray<BuilderNode>,
): NodeMoveContext {
  if (!node || path.length < 2) return NO_MOVE;
  const parentNode = path[path.length - 2];
  if (
    !parentNode ||
    !("children" in parentNode) ||
    !Array.isArray(parentNode.children)
  ) {
    return NO_MOVE;
  }
  const index = parentNode.children.findIndex((child) => child.id === node.id);
  if (index < 0) return NO_MOVE;
  return {
    canMoveUp: index > 0,
    canMoveDown: index < parentNode.children.length - 1,
  };
}

/**
 * ROTATION — "Reset rotation" only renders when the block actually carries a
 * rotate escape; a reset on an unrotated block would be a no-op row.
 */
export function nodeHasRotationEscape(
  node: BuilderNode | null | undefined,
): boolean {
  if (!node || node.kind === "section") return false;
  const style = (node.props as { style?: { rotate?: unknown } } | undefined)
    ?.style;
  return !!style?.rotate;
}
