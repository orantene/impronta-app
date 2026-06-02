import {
  resolveBuilderNodeRole,
  type BuilderNode,
  type BuilderNodeTree,
} from "@/lib/site-admin/builder-node";

/** Returns true when `nodeId` exists in the current reconciled tree (P7A-2 honest selection). */
export function treeContainsBuilderNodeId(
  tree: BuilderNodeTree,
  nodeId: string,
): boolean {
  return findBuilderNodeById(tree, nodeId) != null;
}

/**
 * P7A-2 — single source for "honest" builder child selection: never surface an
 * override id that is missing from the reconciled tree or owned by another
 * section (sync with `builderTree` / maps — no one-frame ghost id in context).
 */
export function resolveHonestSelectedBuilderNodeId(input: {
  selectedSectionId: string | null;
  selectedBuilderNodeIdOverride: string | null;
  builderTree: BuilderNodeTree;
  sectionIdByBuilderNodeId: ReadonlyMap<string, string>;
  builderNodeIdBySectionId: ReadonlyMap<string, string>;
}): string | null {
  const {
    selectedSectionId,
    selectedBuilderNodeIdOverride,
    builderTree,
    sectionIdByBuilderNodeId,
    builderNodeIdBySectionId,
  } = input;
  const override = selectedBuilderNodeIdOverride;
  // Freeform full-page designs have builder nodes with NO owner section, so
  // both the override's mapped section and `selectedSectionId` are null. Check
  // the override FIRST (works for section-owned AND section-less nodes) — the
  // old `if (!selectedSectionId) return null` bailed before this, so every
  // freeform block resolved to "nothing selected" even after selectBuilderNode.
  // (`?? null` so a missing map entry compares equal to a null section.)
  if (
    override &&
    treeContainsBuilderNodeId(builderTree, override) &&
    (sectionIdByBuilderNodeId.get(override) ?? null) === selectedSectionId
  ) {
    return override;
  }
  if (!selectedSectionId) return null;
  return builderNodeIdBySectionId.get(selectedSectionId) ?? null;
}

export function findBuilderNodeById(
  tree: BuilderNodeTree,
  nodeId: string | null,
): BuilderNode | null {
  if (!nodeId) return null;
  const queue = [...tree];
  while (queue.length > 0) {
    const current = queue.shift() ?? null;
    if (!current) continue;
    if (current.id === nodeId) return current;
    if ("children" in current && Array.isArray(current.children)) {
      queue.unshift(...current.children);
    }
  }
  return null;
}

export function resolveStandaloneBuilderNodeForContent(
  tree: BuilderNodeTree,
  selectedBuilderNodeId: string | null,
): Exclude<BuilderNode, { kind: "section" | "section_embed" }> | null {
  if (!selectedBuilderNodeId) return null;
  if (resolveBuilderNodeRole(selectedBuilderNodeId)) return null;
  const node = findBuilderNodeById(tree, selectedBuilderNodeId);
  // `section` (legacy slot) and `section_embed` (Tulala component) carry no
  // free-form style/content props — their presentation lives in the curated
  // section payload — so they are not "standalone" style/content nodes.
  if (!node || node.kind === "section" || node.kind === "section_embed") {
    return null;
  }
  return node;
}
