/**
 * CANVAS-1 — insert-at-selection hint resolver.
 *
 * Pure tree-traversal utility shared by AddGalleryPanel and its unit tests.
 * No React imports; safe to import from tests and server contexts.
 */

import type { BuilderNode, BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

/**
 * The resolved target for the next gallery insert.
 *
 * - `parentId: null` with an `index` → insert at root level after the section
 *   that owns the current selection (typical for sections/connected blocks).
 * - `parentId: <id>` with an `index` → insert after the selected node inside
 *   its parent container (typical for element inserts into a layout block).
 */
export interface GalleryInsertHint {
  parentId: string | null;
  index: number;
}

/**
 * Walk the tree to compute the insert position adjacent to `selectedNodeId`.
 *
 * Returns:
 * - `{ parentId: containerId, index: afterIndex }` when the node lives inside
 *   a container (element insert into layout block).
 * - `{ parentId: null, index: sectionAfterIndex }` when the node is a root-
 *   level section or nested inside one (section-level insert at root).
 * - `null` when `selectedNodeId` is not found in the tree (stale selection).
 *   The caller must fall back to `{ parentId: null, index: tree.length }`.
 */
export function resolveGalleryInsertHint(
  tree: BuilderNodeTree,
  selectedNodeId: string,
): GalleryInsertHint | null {
  function walk(
    nodes: ReadonlyArray<BuilderNode>,
    parentId: string | null,
    rootSectionIndex: number,
  ): GalleryInsertHint | null {
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i]!;
      const isRootSection = parentId === null && node.kind === "section";
      const effectiveRootIdx = isRootSection ? i : rootSectionIndex;

      if (node.id === selectedNodeId) {
        // Prefer nested parent context when the selected node lives inside a
        // container (parentId is non-null). For root-level section nodes, use
        // the root index so the insert lands after that section.
        if (parentId !== null) {
          return { parentId, index: i + 1 };
        }
        return { parentId: null, index: effectiveRootIdx + 1 };
      }

      if ("children" in node && Array.isArray(node.children) && node.children.length > 0) {
        const nested = walk(node.children, node.id, effectiveRootIdx);
        if (nested !== null) return nested;
      }
    }
    return null;
  }

  return walk(tree, null, 0);
}
