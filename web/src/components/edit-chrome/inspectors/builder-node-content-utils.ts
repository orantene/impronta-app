import {
  resolveBuilderNodeRole,
  type BuilderNode,
  type BuilderNodeTree,
} from "@/lib/site-admin/builder-node";

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
