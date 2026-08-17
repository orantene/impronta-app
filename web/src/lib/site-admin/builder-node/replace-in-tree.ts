/**
 * Pure tree helpers for the AI "revise this block" flow: replace a node's whole
 * subtree in place, and locate a node's parent + sibling index. Both are pure
 * (immutable) so they can back an undoable apply and be unit-tested without a
 * React tree. See [[ai-revise-modal]] / selection-layer wiring.
 */
import type { BuilderNode, BuilderNodeTree } from "./types";

function childrenOf(node: BuilderNode): BuilderNode[] | null {
  const kids = (node as { children?: unknown }).children;
  return Array.isArray(kids) ? (kids as BuilderNode[]) : null;
}

/**
 * Return a new tree with the node identified by `nodeId` replaced by
 * `replacement` (its whole subtree). Immutable: unaffected branches keep their
 * identity. `replaced` is false when the id wasn't found (tree returned as-is).
 */
export function replaceBuilderNodeInTree(
  tree: BuilderNodeTree,
  nodeId: string,
  replacement: BuilderNode,
): { tree: BuilderNodeTree; replaced: boolean } {
  let replaced = false;
  const walk = (nodes: BuilderNode[]): BuilderNode[] =>
    nodes.map((n) => {
      if ((n as { id?: unknown }).id === nodeId) {
        replaced = true;
        return replacement;
      }
      const kids = childrenOf(n);
      if (!kids) return n;
      const nextKids = walk(kids);
      return nextKids === kids ? n : ({ ...n, children: nextKids } as BuilderNode);
    });
  const next = walk(tree as BuilderNode[]);
  return { tree: replaced ? next : tree, replaced };
}

/** Where a node sits among its siblings. */
export interface BuilderNodeSiblingPosition {
  parentId: string | null;
  index: number;
  /**
   * How many nodes share this node's parent (including itself). Lets a caller
   * decide whether a "move down" is even possible without re-walking the tree —
   * which is what the canvas move rail's arrows gate on.
   */
  siblingCount: number;
}

/**
 * Find a node's parent id (null when it is a root node), its index within its
 * parent's children (root index when it is a root node), and how many siblings
 * that list holds. Returns null when the id isn't in the tree.
 */
export function findBuilderNodeParentIndex(
  tree: BuilderNodeTree,
  nodeId: string,
): BuilderNodeSiblingPosition | null {
  const roots = tree as BuilderNode[];
  const rootIndex = roots.findIndex((n) => (n as { id?: unknown }).id === nodeId);
  if (rootIndex >= 0) {
    return { parentId: null, index: rootIndex, siblingCount: roots.length };
  }

  const walk = (parent: BuilderNode): BuilderNodeSiblingPosition | null => {
    const kids = childrenOf(parent);
    if (!kids) return null;
    const idx = kids.findIndex((k) => (k as { id?: unknown }).id === nodeId);
    if (idx >= 0) {
      const parentId = (parent as { id?: unknown }).id;
      return {
        parentId: typeof parentId === "string" ? parentId : null,
        index: idx,
        siblingCount: kids.length,
      };
    }
    for (const k of kids) {
      const hit = walk(k);
      if (hit) return hit;
    }
    return null;
  };

  for (const root of tree as BuilderNode[]) {
    const hit = walk(root);
    if (hit) return hit;
  }
  return null;
}
