/**
 * Slash-command insert — allowed-kinds resolution for an anchor target.
 *
 * `resolveInsertAnchor` (add-gallery/gallery-insert-hint.ts) already answers
 * "where does the next insert land" (selection → viewport section → end).
 * This module answers the companion question — "what kinds are insertable
 * there" — the same registry + plan gate `CanvasBetweenBlocksInsert` (root
 * level) and `selection-layer.tsx`'s `selectedNodeAllowedKinds` (nested
 * level) already apply, generalized to an arbitrary `parentId` so both the
 * Lexical slash trigger and the canvas keyboard trigger can share it.
 */

import {
  BUILDER_NODE_REGISTRY,
  gateNestedInsertKinds,
  type BuilderNodeKind,
  type BuilderNodeTree,
} from "@/lib/site-admin/builder-node";
import { findBuilderNodeById } from "./inspectors/builder-node-content-utils";

/**
 * Registry + plan-gated kinds insertable at `parentId` (`null` = tree root).
 * Mirrors `CanvasBetweenBlocksInsert`'s root-level computation and
 * `selection-layer.tsx`'s per-node `selectedNodeAllowedKinds` in one function.
 */
export function allowedKindsForInsertParent(
  tree: BuilderNodeTree,
  parentId: string | null,
  advancedElementLibraryEnabled: boolean,
  canInsertRawHtmlElements: boolean,
): BuilderNodeKind[] {
  if (parentId === null) {
    return gateNestedInsertKinds(
      Object.keys(BUILDER_NODE_REGISTRY) as BuilderNodeKind[],
      advancedElementLibraryEnabled,
      canInsertRawHtmlElements,
    );
  }
  const parentNode = findBuilderNodeById(tree, parentId);
  if (!parentNode) return [];
  const policy = BUILDER_NODE_REGISTRY[parentNode.kind].children;
  const raw = policy.type === "allow_list" ? [...policy.kinds] : [];
  return gateNestedInsertKinds(raw, advancedElementLibraryEnabled, canInsertRawHtmlElements);
}
