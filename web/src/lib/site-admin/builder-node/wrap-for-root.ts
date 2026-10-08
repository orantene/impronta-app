import { createBuilderNode } from "./create";
import { builderNodeKindAllowedAtRoot } from "./drop-policy";
import { BUILDER_NODE_REGISTRY } from "./registry";
import type { BuilderNode } from "./types";

/**
 * TUL-52 C: a leaf block (Texto, Imagen, ...) inserted at page root used to be
 * refused with a dev-facing "cannot live at page root" toast. Wrap it in a
 * section so the insert lands in a valid container. Returns the node itself
 * when the root accepts it, or null when no section can hold it (caller then
 * shows the friendly message).
 */
export function wrapNodeForRootInsert(node: BuilderNode): BuilderNode | null {
  if (builderNodeKindAllowedAtRoot(node.kind)) return node;
  const policy = BUILDER_NODE_REGISTRY.section.children;
  const fits =
    policy.type === "any" || (policy.type === "allow_list" && policy.kinds.includes(node.kind));
  if (!fits) return null;
  const section = createBuilderNode("section") as BuilderNode & { children?: BuilderNode[] };
  return { ...section, children: [...(section.children ?? []), node] } as BuilderNode;
}

/** Insert helper: at page root auto-wrap in a section, elsewhere (or if impossible) pass through. */
export function wrapRootInsert(parentId: string | null, node: BuilderNode): BuilderNode {
  return parentId === null ? (wrapNodeForRootInsert(node) ?? node) : node;
}

/** wrapRootInsert plus the id of the original (possibly wrapped) leaf, for selection. */
export function wrapRootInsertTracked(parentId: string | null, leaf: BuilderNode) {
  return { node: wrapRootInsert(parentId, leaf), leafId: leaf.id };
}
