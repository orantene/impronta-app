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

/**
 * Find a node's parent id (null when it is a root node) and its index within its
 * parent's children (root index when it is a root node). Returns null when the
 * id isn't in the tree.
 */
export function findBuilderNodeParentIndex(
  tree: BuilderNodeTree,
  nodeId: string,
): { parentId: string | null; index: number } | null {
  const rootIndex = (tree as BuilderNode[]).findIndex((n) => (n as { id?: unknown }).id === nodeId);
  if (rootIndex >= 0) return { parentId: null, index: rootIndex };

  const walk = (parent: BuilderNode): { parentId: string | null; index: number } | null => {
    const kids = childrenOf(parent);
    if (!kids) return null;
    const idx = kids.findIndex((k) => (k as { id?: unknown }).id === nodeId);
    if (idx >= 0) {
      const parentId = (parent as { id?: unknown }).id;
      return { parentId: typeof parentId === "string" ? parentId : null, index: idx };
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
