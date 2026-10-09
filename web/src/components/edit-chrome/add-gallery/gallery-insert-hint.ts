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
 * `nearest` - adjacent to the selection inside its own parent (element inserts).
 * `page-root` - after the selection's top-level page band (section-level inserts).
 */
export type GalleryInsertLevel = "nearest" | "page-root";

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
  level: GalleryInsertLevel = "nearest",
): GalleryInsertHint | null {
  function walk(
    nodes: ReadonlyArray<BuilderNode>,
    parentId: string | null,
    rootSectionIndex: number,
  ): GalleryInsertHint | null {
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i]!;
      // TUL-78: EVERY root-level node (section, section_embed, native bands...)
      // owns its own page position. Counting only `kind === "section"` left
      // embeds (Testimonials, FAQ, Gallery) at the initial index 0, so each
      // insert landed at index 1: ABOVE the selected block, not after it.
      const isRootNode = parentId === null;
      const effectiveRootIdx = isRootNode ? i : rootSectionIndex;

      if (node.id === selectedNodeId) {
        // Prefer nested parent context when the selected node lives inside a
        // container (parentId is non-null). For root-level section nodes, use
        // the root index so the insert lands after that section.
        if (parentId !== null && level === "nearest") {
          return { parentId, index: i + 1 };
        }
        // TUL-78 (B-1): a whole-section insert (section embed, section
        // template) never lives inside a hero / container. It lands after the
        // page-root ancestor of the selection instead of nesting under it.
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

/**
 * W1-L4 — the concrete parent/index a gallery insert should land at.
 *
 * Unlike {@link resolveGalleryInsertHint} (which returns `null` for an unknown
 * node so the caller must supply its own fallback), this ALWAYS returns a usable
 * anchor. The decision, in priority order:
 *
 *   1. `selectedNodeId` — if a block/section is selected and still in the tree,
 *      insert adjacent to it (element into its container, or after its section).
 *   2. `viewportSectionId` — otherwise, if a section is currently in the canvas
 *      viewport, insert right after that section (so the new block lands where
 *      the user is looking, not at the far bottom of the page).
 *   3. Fallback — append at the end of the root tree. The caller still scrolls
 *      the new node into view + flashes it, so even the fallback is visible.
 *
 * Pure + framework-free: the DOM lookup that produces `viewportSectionId` lives
 * in the panel; this function only reasons about the tree.
 */
export function resolveInsertAnchor(
  tree: BuilderNodeTree,
  selectedNodeId: string | null,
  viewportSectionId: string | null,
  level: GalleryInsertLevel = "nearest",
): GalleryInsertHint {
  if (selectedNodeId !== null && selectedNodeId !== "") {
    const bySelection = resolveGalleryInsertHint(tree, selectedNodeId, level);
    if (bySelection !== null) return bySelection;
  }
  if (viewportSectionId !== null && viewportSectionId !== "") {
    const byViewport = resolveGalleryInsertHint(tree, viewportSectionId, level);
    if (byViewport !== null) return byViewport;
  }
  return { parentId: null, index: tree.length };
}

/**
 * TUL-78 (B-1): which insert level a gallery action needs. Whole-section
 * actions (section embed, connected section, section template) belong at the
 * page root; element and block-template inserts stay next to the selection.
 */
export function insertLevelForGalleryAction(actionType: string): GalleryInsertLevel {
  return actionType === "sectionEmbed" ||
    actionType === "connectedNode" ||
    actionType === "sectionTemplate"
    ? "page-root"
    : "nearest";
}
