import {
  BUILDER_NODE_REGISTRY,
  builderNodeKindAllowedAtRoot,
  validateBuilderNodeTree,
  type BuilderNode,
  type BuilderNodeTree,
} from "@/lib/site-admin/builder-node";
import { makeId } from "@/lib/site-admin/builder-node/create";

type TransformResult =
  | { ok: true; tree: BuilderNodeTree; nodeIds: string[]; nodeId?: string }
  | { ok: false; error: string };

interface NodeLocation {
  node: BuilderNode;
  index: number;
  parentId: string | null;
  parentPath: number[];
}

export interface SerializedBuilderNodeClipboard {
  version: 2;
  nodes: BuilderNode[];
}

function cloneNode(node: BuilderNode): BuilderNode {
  if ("children" in node && Array.isArray(node.children)) {
    return { ...node, children: node.children.map(cloneNode) } as BuilderNode;
  }
  return { ...node } as BuilderNode;
}

function cloneTree(tree: BuilderNodeTree): BuilderNodeTree {
  return tree.map(cloneNode);
}

function getNodeAtPath(
  tree: ReadonlyArray<BuilderNode>,
  path: ReadonlyArray<number>,
): BuilderNode | null {
  let node: BuilderNode | null = null;
  let children = tree;
  for (const index of path) {
    node = children[index] ?? null;
    if (!node) return null;
    if ("children" in node && Array.isArray(node.children)) {
      children = node.children;
    }
  }
  return node;
}

function childrenAtPath(tree: BuilderNodeTree, path: ReadonlyArray<number>): BuilderNode[] {
  if (path.length === 0) return tree;
  const parent = getNodeAtPath(tree, path);
  if (!parent || !("children" in parent) || !Array.isArray(parent.children)) return [];
  return parent.children;
}

function findLocation(
  tree: ReadonlyArray<BuilderNode>,
  nodeId: string,
): NodeLocation | null {
  function walk(
    nodes: ReadonlyArray<BuilderNode>,
    parentId: string | null,
    parentPath: number[],
  ): NodeLocation | null {
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index]!;
      if (node.id === nodeId) return { node, index, parentId, parentPath };
      if ("children" in node && Array.isArray(node.children)) {
        const nested = walk(node.children, node.id, [...parentPath, index]);
        if (nested) return nested;
      }
    }
    return null;
  }
  return walk(tree, null, []);
}

function parentAllows(parent: BuilderNode | null, child: BuilderNode): boolean {
  if (!parent) return builderNodeKindAllowedAtRoot(child.kind);
  const policy = BUILDER_NODE_REGISTRY[parent.kind].children;
  if (policy.type === "any") return true;
  if (policy.type === "none") return false;
  return policy.kinds.includes(child.kind);
}

function finalize(tree: BuilderNodeTree): TransformResult {
  const validation = validateBuilderNodeTree(tree);
  if (!validation.ok) {
    return {
      ok: false,
      error: validation.issues.map((issue) => issue.message).join(" "),
    };
  }
  return { ok: true, tree: validation.tree, nodeIds: [] };
}

function orderedSiblingSelection(
  tree: BuilderNodeTree,
  nodeIds: ReadonlyArray<string>,
): { parentId: string | null; parentPath: number[]; entries: NodeLocation[] } | { error: string } {
  const unique = nodeIds.filter((id, index) => id && nodeIds.indexOf(id) === index);
  if (unique.length < 2) return { error: "Select at least two sibling blocks first." };
  const locations = unique.map((id) => findLocation(tree, id));
  if (locations.some((location) => !location)) {
    return { error: "One of the selected blocks is no longer on the page." };
  }
  const entries = locations as NodeLocation[];
  if (entries.some((entry) => entry.node.kind === "section")) {
    return { error: "Group blocks inside a section, not whole sections." };
  }
  const parentKey = JSON.stringify(entries[0]!.parentPath);
  if (entries.some((entry) => JSON.stringify(entry.parentPath) !== parentKey)) {
    return { error: "Group, duplicate, and cut currently require sibling blocks." };
  }
  return {
    parentId: entries[0]!.parentId,
    parentPath: entries[0]!.parentPath,
    entries: [...entries].sort((a, b) => a.index - b.index),
  };
}

function containerPropsForParent(parent: BuilderNode | null, count: number) {
  if (parent?.kind === "container") {
    const layout = parent.props.layout;
    return {
      layout,
      gap: parent.props.gap ?? "m",
      columns:
        layout === "grid"
          ? (Math.min(parent.props.columns ?? count, 4) as 1 | 2 | 3 | 4)
          : undefined,
      align: parent.props.align,
    };
  }
  return { layout: "stack" as const, gap: "m" as const };
}

export function groupSiblingBuilderNodes(
  tree: BuilderNodeTree,
  nodeIds: ReadonlyArray<string>,
  idFactory: () => string = () => makeId("container"),
): TransformResult {
  const selection = orderedSiblingSelection(tree, nodeIds);
  if ("error" in selection) return { ok: false, error: selection.error };
  const nextTree = cloneTree(tree);
  const parent = selection.parentPath.length
    ? getNodeAtPath(nextTree, selection.parentPath)
    : null;
  const group: BuilderNode = {
    id: idFactory(),
    kind: "container",
    props: containerPropsForParent(parent, selection.entries.length),
    children: selection.entries.map((entry) => cloneNode(entry.node)),
  };
  if (!parentAllows(parent, group)) {
    return { ok: false, error: "This parent cannot contain a layout group." };
  }
  const siblings = childrenAtPath(nextTree, selection.parentPath);
  for (const entry of [...selection.entries].sort((a, b) => b.index - a.index)) {
    siblings.splice(entry.index, 1);
  }
  siblings.splice(selection.entries[0]!.index, 0, group);
  const result = finalize(nextTree);
  if (!result.ok) return result;
  return { ok: true, tree: result.tree, nodeId: group.id, nodeIds: [group.id] };
}

export function ungroupBuilderNode(
  tree: BuilderNodeTree,
  nodeId: string,
): TransformResult {
  const location = findLocation(tree, nodeId);
  if (!location) return { ok: false, error: "That group is no longer on the page." };
  if (location.node.kind !== "container") {
    return { ok: false, error: "Select a container group before ungrouping." };
  }
  const children =
    "children" in location.node && Array.isArray(location.node.children)
      ? location.node.children.map(cloneNode)
      : [];
  if (children.length === 0) return { ok: false, error: "That group has no children to ungroup." };
  const nextTree = cloneTree(tree);
  const parent = location.parentPath.length
    ? getNodeAtPath(nextTree, location.parentPath)
    : null;
  if (children.some((child) => !parentAllows(parent, child))) {
    return { ok: false, error: "This parent cannot contain one of the group's children." };
  }
  const siblings = childrenAtPath(nextTree, location.parentPath);
  siblings.splice(location.index, 1, ...children);
  const result = finalize(nextTree);
  if (!result.ok) return result;
  return {
    ok: true,
    tree: result.tree,
    nodeIds: children.map((child) => child.id),
  };
}

export function removeBuilderNodes(
  tree: BuilderNodeTree,
  nodeIds: ReadonlyArray<string>,
): TransformResult {
  const removeIds = new Set(nodeIds);
  if (removeIds.size === 0) return { ok: false, error: "Select a block first." };
  let removed = false;
  const visit = (nodes: ReadonlyArray<BuilderNode>): BuilderNode[] =>
    nodes.flatMap((node) => {
      if (removeIds.has(node.id) && node.kind !== "section") {
        removed = true;
        return [];
      }
      if ("children" in node && Array.isArray(node.children)) {
        return [{ ...node, children: visit(node.children) } as BuilderNode];
      }
      return [cloneNode(node)];
    });
  const nextTree = visit(tree);
  if (!removed) return { ok: false, error: "None of the selected blocks can be removed." };
  const result = finalize(nextTree);
  if (!result.ok) return result;
  return { ok: true, tree: result.tree, nodeIds: [] };
}

export function cloneNodeWithFreshIds(
  node: BuilderNode,
  idFactory: (kind: BuilderNode["kind"]) => string = (kind) => makeId(kind),
  idMap: Map<string, string> = new Map(),
): BuilderNode {
  const nextId = idFactory(node.kind);
  idMap.set(node.id, nextId);
  const props = { ...(node.props as Record<string, unknown>) };
  if ("children" in node && Array.isArray(node.children)) {
    const children = node.children.map((child) =>
      cloneNodeWithFreshIds(child, idFactory, idMap),
    );
    if (node.kind === "accordion" && Array.isArray(props.defaultOpenItemIds)) {
      props.defaultOpenItemIds = props.defaultOpenItemIds
        .map((id) => (typeof id === "string" ? idMap.get(id) : null))
        .filter((id): id is string => Boolean(id));
    }
    if (node.kind === "tabs" && typeof props.defaultTabId === "string") {
      const nextDefault = idMap.get(props.defaultTabId);
      if (nextDefault) props.defaultTabId = nextDefault;
      else delete props.defaultTabId;
    }
    return { ...node, id: nextId, props, children } as BuilderNode;
  }
  return { ...node, id: nextId, props } as BuilderNode;
}

export function serializeBuilderNodeClipboard(
  tree: BuilderNodeTree,
  nodeIds: ReadonlyArray<string>,
): SerializedBuilderNodeClipboard | { error: string } {
  const unique = nodeIds.filter((id, index) => id && nodeIds.indexOf(id) === index);
  if (unique.length === 0) return { error: "Select a block first." };
  const entries = unique
    .map((id) => findLocation(tree, id))
    .filter((entry): entry is NodeLocation => Boolean(entry))
    .filter((entry) => entry.node.kind !== "section")
    .sort((a, b) => {
      const aPath = [...a.parentPath, a.index].join(".");
      const bPath = [...b.parentPath, b.index].join(".");
      return aPath.localeCompare(bPath, undefined, { numeric: true });
    });
  if (entries.length === 0) return { error: "Select a block inside a section first." };
  return { version: 2, nodes: entries.map((entry) => cloneNode(entry.node)) };
}

export function duplicateBuilderNodes(
  tree: BuilderNodeTree,
  nodeIds: ReadonlyArray<string>,
): TransformResult {
  const selection = orderedSiblingSelection(tree, nodeIds);
  if ("error" in selection) return { ok: false, error: selection.error };
  const nextTree = cloneTree(tree);
  const siblings = childrenAtPath(nextTree, selection.parentPath);
  const duplicates = selection.entries.map((entry) => cloneNodeWithFreshIds(entry.node));
  siblings.splice(selection.entries[selection.entries.length - 1]!.index + 1, 0, ...duplicates);
  const result = finalize(nextTree);
  if (!result.ok) return result;
  return { ok: true, tree: result.tree, nodeIds: duplicates.map((node) => node.id) };
}

export function pasteBuilderNodeClipboard(
  tree: BuilderNodeTree,
  clipboard: SerializedBuilderNodeClipboard,
  targetNodeId?: string | null,
): TransformResult {
  if (clipboard.version !== 2 || clipboard.nodes.length === 0) {
    return { ok: false, error: "Copy a block before pasting." };
  }
  const nextTree = cloneTree(tree);
  const copies = clipboard.nodes.map((node) => cloneNodeWithFreshIds(node));
  let parentPath: number[] = [];
  let index = nextTree.length;
  let parent: BuilderNode | null = null;
  if (targetNodeId) {
    const target = findLocation(nextTree, targetNodeId);
    if (!target) return { ok: false, error: "The paste target is no longer on the page." };
    const targetPolicy = BUILDER_NODE_REGISTRY[target.node.kind].children;
    if (
      targetPolicy.type !== "none" &&
      copies.every((copy) => parentAllows(target.node, copy))
    ) {
      parentPath = [...target.parentPath, target.index];
      parent = target.node;
      const current = "children" in target.node && Array.isArray(target.node.children)
        ? target.node.children.length
        : 0;
      index = current;
    } else {
      parentPath = target.parentPath;
      parent = parentPath.length ? getNodeAtPath(nextTree, parentPath) : null;
      index = target.index + 1;
    }
  }
  if (copies.some((copy) => !parentAllows(parent, copy))) {
    return { ok: false, error: "These copied blocks do not fit at the paste target." };
  }
  const siblings = childrenAtPath(nextTree, parentPath);
  siblings.splice(index, 0, ...copies);
  const result = finalize(nextTree);
  if (!result.ok) return result;
  return { ok: true, tree: result.tree, nodeIds: copies.map((node) => node.id) };
}
