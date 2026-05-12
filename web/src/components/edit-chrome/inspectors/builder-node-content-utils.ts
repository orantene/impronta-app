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
  if (!selectedSectionId) return null;
  const override = selectedBuilderNodeIdOverride;
  if (
    override &&
    treeContainsBuilderNodeId(builderTree, override) &&
    sectionIdByBuilderNodeId.get(override) === selectedSectionId
  ) {
    return override;
  }
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
): Exclude<BuilderNode, { kind: "section" }> | null {
  if (!selectedBuilderNodeId) return null;
  if (resolveBuilderNodeRole(selectedBuilderNodeId)) return null;
  const node = findBuilderNodeById(tree, selectedBuilderNodeId);
  if (!node || node.kind === "section") return null;
  return node;
}
