import { BUILDER_NODE_REGISTRY } from "./registry";
import { builderNodeKindAllowedAtRoot } from "./drop-policy";
import type { BuilderNode, BuilderNodeTree } from "./types";
import { validateBuilderNodeTree } from "./validate";

export type BuilderNodeOpCode =
  | "NODE_NOT_FOUND"
  | "NODE_KIND_NOT_DUPLICABLE"
  | "PARENT_NOT_FOUND"
  | "PARENT_DOES_NOT_ALLOW_CHILDREN"
  | "ROOT_KIND_NOT_ALLOWED"
  | "CHILD_KIND_NOT_ALLOWED"
  | "INVALID_MOVE_TARGET"
  | "VALIDATION_FAILED";

export type BuilderNodeOpResult =
  | { ok: true; tree: BuilderNodeTree }
  | {
      ok: false;
      code: BuilderNodeOpCode;
      message: string;
      issues?: ReadonlyArray<{ path: string; message: string }>;
    };

export type BuilderNodeDuplicateResult =
  | { ok: true; tree: BuilderNodeTree; nodeId: string }
  | {
      ok: false;
      code: BuilderNodeOpCode;
      message: string;
      issues?: ReadonlyArray<{ path: string; message: string }>;
    };

export type BuilderNodePasteResult = BuilderNodeDuplicateResult;

export type BuilderNodeOperationKind =
  | "insert"
  | "move"
  | "remove"
  | "duplicate"
  | "paste"
  | "patch";

export type BuilderNodeOperationInput =
  | {
      operation: "insert";
      tree: BuilderNodeTree;
      node: BuilderNode;
      parentId: string | null;
      index?: number;
    }
  | {
      operation: "move";
      tree: BuilderNodeTree;
      nodeId: string;
      parentId: string | null;
      index: number;
    }
  | {
      operation: "remove";
      tree: BuilderNodeTree;
      nodeId: string;
    }
  | {
      operation: "duplicate";
      tree: BuilderNodeTree;
      nodeId: string;
    }
  | {
      operation: "paste";
      tree: BuilderNodeTree;
      node: BuilderNode;
      parentId: string | null;
      index?: number;
    }
  | {
      operation: "patch";
      tree: BuilderNodeTree;
      nodeId: string;
      patch: Record<string, unknown>;
    };

export type BuilderNodeOperationResult =
  | {
      ok: true;
      operation: BuilderNodeOperationKind;
      tree: BuilderNodeTree;
      nodeId?: string;
    }
  | {
      ok: false;
      operation: BuilderNodeOperationKind;
      code: BuilderNodeOpCode;
      message: string;
      issues?: ReadonlyArray<{ path: string; message: string }>;
    };

interface NodeLocation {
  node: BuilderNode;
  index: number;
  path: number[];
  parentPath: number[];
  parentId: string | null;
}

function cloneNode(node: BuilderNode): BuilderNode {
  if ("children" in node && Array.isArray(node.children)) {
    return {
      ...node,
      children: node.children.map(cloneNode),
    };
  }
  return { ...node };
}

function cloneTree(tree: BuilderNodeTree): BuilderNodeTree {
  return tree.map(cloneNode);
}

function freshNodeId(kind: BuilderNode["kind"]): string {
  return `${kind}-${crypto.randomUUID()}`;
}

function cloneNodeWithFreshIds(
  node: BuilderNode,
  idMap: Map<string, string>,
): BuilderNode {
  const nextId = freshNodeId(node.kind);
  idMap.set(node.id, nextId);

  if ("children" in node && Array.isArray(node.children)) {
    const children = node.children.map((child) =>
      cloneNodeWithFreshIds(child, idMap),
    );
    const cloned = {
      ...node,
      id: nextId,
      props: { ...(node.props as Record<string, unknown>) },
      children,
    } as BuilderNode;

    if (cloned.kind === "accordion") {
      cloned.props = {
        ...cloned.props,
        defaultOpenItemIds: cloned.props.defaultOpenItemIds
          ?.map((id) => idMap.get(id))
          .filter((id): id is string => Boolean(id)),
      };
      if (cloned.props.defaultOpenItemIds?.length === 0) {
        delete cloned.props.defaultOpenItemIds;
      }
    }

    if (cloned.kind === "tabs" && cloned.props.defaultTabId) {
      const nextDefaultTabId = idMap.get(cloned.props.defaultTabId);
      cloned.props = {
        ...cloned.props,
        defaultTabId: nextDefaultTabId,
      };
      if (!nextDefaultTabId) {
        delete cloned.props.defaultTabId;
      }
    }

    return cloned;
  }

  return {
    ...node,
    id: nextId,
    props: { ...(node.props as Record<string, unknown>) },
  } as BuilderNode;
}

function findNodeLocation(
  tree: ReadonlyArray<BuilderNode>,
  nodeId: string,
): NodeLocation | null {
  function walk(
    nodes: ReadonlyArray<BuilderNode>,
    parentPath: number[],
    parentId: string | null,
  ): NodeLocation | null {
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index]!;
      const path = [...parentPath, index];
      if (node.id === nodeId) {
        return { node, index, path, parentPath, parentId };
      }
      if ("children" in node && Array.isArray(node.children)) {
        const nested = walk(node.children, path, node.id);
        if (nested) return nested;
      }
    }
    return null;
  }
  return walk(tree, [], null);
}

function getNodeByPath(
  tree: ReadonlyArray<BuilderNode>,
  path: ReadonlyArray<number>,
): BuilderNode | null {
  let nodes = tree;
  let node: BuilderNode | null = null;
  for (let i = 0; i < path.length; i += 1) {
    const index = path[i]!;
    node = nodes[index] ?? null;
    if (!node) return null;
    if (i < path.length - 1) {
      if (!("children" in node) || !Array.isArray(node.children)) return null;
      nodes = node.children;
    }
  }
  return node;
}

function getChildrenRefAtPath(
  tree: BuilderNodeTree,
  parentPath: ReadonlyArray<number>,
): BuilderNode[] | null {
  if (parentPath.length === 0) return tree;
  const parent = getNodeByPath(tree, parentPath);
  if (!parent) return null;
  const childrenPolicy = BUILDER_NODE_REGISTRY[parent.kind].children;
  if (childrenPolicy.type === "none") return null;
  if (!("children" in parent) || !Array.isArray(parent.children)) {
    (parent as BuilderNode & { children?: BuilderNode[] }).children = [];
  }
  return (parent as BuilderNode & { children: BuilderNode[] }).children;
}

function childAllowed(
  parentKind: BuilderNode["kind"],
  childKind: BuilderNode["kind"],
): boolean {
  const policy = BUILDER_NODE_REGISTRY[parentKind].children;
  if (policy.type === "any") return true;
  if (policy.type === "none") return false;
  return policy.kinds.includes(childKind);
}

function subtreeContainsId(node: BuilderNode, nodeId: string): boolean {
  if (node.id === nodeId) return true;
  if (!("children" in node) || !Array.isArray(node.children)) return false;
  return node.children.some((child) => subtreeContainsId(child, nodeId));
}

function removingWouldEmptyRequiredGroup(
  tree: ReadonlyArray<BuilderNode>,
  location: NodeLocation,
): boolean {
  const parent = getNodeByPath(tree, location.parentPath);
  if (!parent || !("children" in parent) || !Array.isArray(parent.children)) {
    return false;
  }
  return (
    ((parent.kind === "accordion" && location.node.kind === "accordion_item") ||
      (parent.kind === "tabs" && location.node.kind === "tab_panel")) &&
    parent.children.length <= 1
  );
}

function validateTreeOrFail(tree: BuilderNodeTree): BuilderNodeOpResult {
  const validation = validateBuilderNodeTree(tree);
  if (!validation.ok) {
    return {
      ok: false,
      code: "VALIDATION_FAILED",
      message: "Builder node tree failed validation after operation.",
      issues: validation.issues,
    };
  }
  return { ok: true, tree: validation.tree };
}

export function insertBuilderNode(input: {
  tree: BuilderNodeTree;
  node: BuilderNode;
  parentId: string | null;
  index?: number;
}): BuilderNodeOpResult {
  const nextTree = cloneTree(input.tree);
  let targetPath: number[] = [];
  let parentKind: BuilderNode["kind"] | null = null;

  if (input.parentId) {
    const parent = findNodeLocation(nextTree, input.parentId);
    if (!parent) {
      return {
        ok: false,
        code: "PARENT_NOT_FOUND",
        message: `Parent node "${input.parentId}" was not found.`,
      };
    }
    targetPath = parent.path;
    parentKind = parent.node.kind;
    const policy = BUILDER_NODE_REGISTRY[parent.node.kind].children;
    if (policy.type === "none") {
      return {
        ok: false,
        code: "PARENT_DOES_NOT_ALLOW_CHILDREN",
        message: `Parent "${parent.node.id}" does not allow children.`,
      };
    }
    if (!childAllowed(parent.node.kind, input.node.kind)) {
      return {
        ok: false,
        code: "CHILD_KIND_NOT_ALLOWED",
        message: `Child kind "${input.node.kind}" is not allowed under "${parent.node.kind}".`,
      };
    }
  } else if (!builderNodeKindAllowedAtRoot(input.node.kind)) {
    return {
      ok: false,
      code: "ROOT_KIND_NOT_ALLOWED",
      message: `Root cannot contain node kind "${input.node.kind}".`,
    };
  }

  const targetChildren = getChildrenRefAtPath(nextTree, targetPath);
  if (!targetChildren) {
    return {
      ok: false,
      code: "PARENT_DOES_NOT_ALLOW_CHILDREN",
      message: "Target parent does not support child insertion.",
    };
  }
  if (parentKind && !childAllowed(parentKind, input.node.kind)) {
    return {
      ok: false,
      code: "CHILD_KIND_NOT_ALLOWED",
      message: `Child kind "${input.node.kind}" is not allowed under "${parentKind}".`,
    };
  }
  const rawIndex = input.index ?? targetChildren.length;
  const nextIndex = Math.max(0, Math.min(rawIndex, targetChildren.length));
  targetChildren.splice(nextIndex, 0, cloneNode(input.node));
  return validateTreeOrFail(nextTree);
}

export function removeBuilderNode(input: {
  tree: BuilderNodeTree;
  nodeId: string;
}): BuilderNodeOpResult {
  const nextTree = cloneTree(input.tree);
  const location = findNodeLocation(nextTree, input.nodeId);
  if (!location) {
    return {
      ok: false,
      code: "NODE_NOT_FOUND",
      message: `Node "${input.nodeId}" was not found.`,
    };
  }
  if (removingWouldEmptyRequiredGroup(nextTree, location)) {
    return {
      ok: false,
      code: "INVALID_MOVE_TARGET",
      message: `Cannot remove the last ${location.node.kind === "accordion_item" ? "accordion item" : "tab panel"}.`,
    };
  }
  const parentChildren = getChildrenRefAtPath(nextTree, location.parentPath);
  if (!parentChildren) {
    return {
      ok: false,
      code: "INVALID_MOVE_TARGET",
      message: "Unable to resolve the node parent list for removal.",
    };
  }
  parentChildren.splice(location.index, 1);
  return validateTreeOrFail(nextTree);
}

export function duplicateBuilderNode(input: {
  tree: BuilderNodeTree;
  nodeId: string;
}): BuilderNodeDuplicateResult {
  const nextTree = cloneTree(input.tree);
  const location = findNodeLocation(nextTree, input.nodeId);
  if (!location) {
    return {
      ok: false,
      code: "NODE_NOT_FOUND",
      message: `Node "${input.nodeId}" was not found.`,
    };
  }
  if (location.node.kind === "section") {
    return {
      ok: false,
      code: "NODE_KIND_NOT_DUPLICABLE",
      message: "Section nodes must be duplicated with the section duplicate action.",
    };
  }
  if (!location.parentId && !builderNodeKindAllowedAtRoot(location.node.kind)) {
    return {
      ok: false,
      code: "ROOT_KIND_NOT_ALLOWED",
      message: `Root cannot contain node kind "${location.node.kind}".`,
    };
  }

  const parentChildren = getChildrenRefAtPath(nextTree, location.parentPath);
  if (!parentChildren) {
    return {
      ok: false,
      code: "INVALID_MOVE_TARGET",
      message: "Unable to resolve the node parent list for duplication.",
    };
  }
  const idMap = new Map<string, string>();
  const duplicate = cloneNodeWithFreshIds(location.node, idMap);
  parentChildren.splice(location.index + 1, 0, duplicate);

  const validation = validateBuilderNodeTree(nextTree);
  if (!validation.ok) {
    return {
      ok: false,
      code: "VALIDATION_FAILED",
      message: "Builder node tree failed validation after operation.",
      issues: validation.issues,
    };
  }
  return { ok: true, tree: validation.tree, nodeId: duplicate.id };
}

export function pasteBuilderNode(input: {
  tree: BuilderNodeTree;
  node: BuilderNode;
  parentId: string | null;
  index?: number;
}): BuilderNodePasteResult {
  if (input.node.kind === "section") {
    return {
      ok: false,
      code: "NODE_KIND_NOT_DUPLICABLE",
      message: "Section nodes must be copied with section-level actions.",
    };
  }

  const idMap = new Map<string, string>();
  const pasted = cloneNodeWithFreshIds(input.node, idMap);
  const inserted = insertBuilderNode({
    tree: input.tree,
    node: pasted,
    parentId: input.parentId,
    index: input.index,
  });
  if (!inserted.ok) return inserted;
  return { ok: true, tree: inserted.tree, nodeId: pasted.id };
}

export function moveBuilderNode(input: {
  tree: BuilderNodeTree;
  nodeId: string;
  parentId: string | null;
  index: number;
}): BuilderNodeOpResult {
  const original = findNodeLocation(input.tree, input.nodeId);
  if (!original) {
    return {
      ok: false,
      code: "NODE_NOT_FOUND",
      message: `Node "${input.nodeId}" was not found.`,
    };
  }
  if (input.parentId === input.nodeId) {
    return {
      ok: false,
      code: "INVALID_MOVE_TARGET",
      message: "A node cannot be moved into itself.",
    };
  }
  if (input.parentId && subtreeContainsId(original.node, input.parentId)) {
    return {
      ok: false,
      code: "INVALID_MOVE_TARGET",
      message: "A node cannot be moved into one of its own descendants.",
    };
  }
  if (
    original.parentId !== input.parentId &&
    removingWouldEmptyRequiredGroup(input.tree, original)
  ) {
    return {
      ok: false,
      code: "INVALID_MOVE_TARGET",
      message: `Cannot move the last ${original.node.kind === "accordion_item" ? "accordion item" : "tab panel"} out of its group.`,
    };
  }

  const nextTree = cloneTree(input.tree);
  const moving = findNodeLocation(nextTree, input.nodeId);
  if (!moving) {
    return {
      ok: false,
      code: "NODE_NOT_FOUND",
      message: `Node "${input.nodeId}" was not found.`,
    };
  }
  const sourceChildren = getChildrenRefAtPath(nextTree, moving.parentPath);
  if (!sourceChildren) {
    return {
      ok: false,
      code: "INVALID_MOVE_TARGET",
      message: "Unable to resolve the node source list for move.",
    };
  }
  const [removed] = sourceChildren.splice(moving.index, 1);
  if (!removed) {
    return {
      ok: false,
      code: "NODE_NOT_FOUND",
      message: `Node "${input.nodeId}" was not found in source list.`,
    };
  }

  let targetPath: number[] = [];
  let parentKind: BuilderNode["kind"] | null = null;
  if (input.parentId) {
    const parent = findNodeLocation(nextTree, input.parentId);
    if (!parent) {
      return {
        ok: false,
        code: "PARENT_NOT_FOUND",
        message: `Parent node "${input.parentId}" was not found.`,
      };
    }
    targetPath = parent.path;
    parentKind = parent.node.kind;
    const policy = BUILDER_NODE_REGISTRY[parent.node.kind].children;
    if (policy.type === "none") {
      return {
        ok: false,
        code: "PARENT_DOES_NOT_ALLOW_CHILDREN",
        message: `Parent "${parent.node.id}" does not allow children.`,
      };
    }
    if (!childAllowed(parent.node.kind, removed.kind)) {
      return {
        ok: false,
        code: "CHILD_KIND_NOT_ALLOWED",
        message: `Child kind "${removed.kind}" is not allowed under "${parent.node.kind}".`,
      };
    }
  } else if (!builderNodeKindAllowedAtRoot(removed.kind)) {
    return {
      ok: false,
      code: "ROOT_KIND_NOT_ALLOWED",
      message: `Root cannot contain node kind "${removed.kind}".`,
    };
  }

  const targetChildren = getChildrenRefAtPath(nextTree, targetPath);
  if (!targetChildren) {
    return {
      ok: false,
      code: "PARENT_DOES_NOT_ALLOW_CHILDREN",
      message: "Target parent does not support child insertion.",
    };
  }
  if (parentKind && !childAllowed(parentKind, removed.kind)) {
    return {
      ok: false,
      code: "CHILD_KIND_NOT_ALLOWED",
      message: `Child kind "${removed.kind}" is not allowed under "${parentKind}".`,
    };
  }

  const nextIndex = Math.max(0, Math.min(input.index, targetChildren.length));
  targetChildren.splice(nextIndex, 0, removed);
  return validateTreeOrFail(nextTree);
}

export function patchBuilderNodeProps(input: {
  tree: BuilderNodeTree;
  nodeId: string;
  patch: Record<string, unknown>;
}): BuilderNodeOpResult {
  const nextTree = cloneTree(input.tree);
  const location = findNodeLocation(nextTree, input.nodeId);
  if (!location) {
    return {
      ok: false,
      code: "NODE_NOT_FOUND",
      message: `Node "${input.nodeId}" was not found.`,
    };
  }
  const target = getNodeByPath(nextTree, location.path);
  if (!target) {
    return {
      ok: false,
      code: "NODE_NOT_FOUND",
      message: `Node "${input.nodeId}" was not found for patch.`,
    };
  }
  const mergedProps = {
    ...(target.props as Record<string, unknown>),
    ...input.patch,
  };
  (target as unknown as { props: unknown }).props = mergedProps;
  return validateTreeOrFail(nextTree);
}

/**
 * Unified builder-node operation entrypoint used by UI mutation pipelines.
 * Keeps insert/move/remove/duplicate/paste/patch envelopes consistent so
 * callers can handle optimistic state + errors in one place.
 */
export function applyBuilderNodeOperation(
  input: BuilderNodeOperationInput,
): BuilderNodeOperationResult {
  switch (input.operation) {
    case "insert": {
      const result = insertBuilderNode(input);
      if (!result.ok) {
        return {
          ok: false,
          operation: input.operation,
          code: result.code,
          message: result.message,
          issues: result.issues,
        };
      }
      return { ok: true, operation: input.operation, tree: result.tree };
    }
    case "move": {
      const result = moveBuilderNode(input);
      if (!result.ok) {
        return {
          ok: false,
          operation: input.operation,
          code: result.code,
          message: result.message,
          issues: result.issues,
        };
      }
      return { ok: true, operation: input.operation, tree: result.tree };
    }
    case "remove": {
      const result = removeBuilderNode(input);
      if (!result.ok) {
        return {
          ok: false,
          operation: input.operation,
          code: result.code,
          message: result.message,
          issues: result.issues,
        };
      }
      return { ok: true, operation: input.operation, tree: result.tree };
    }
    case "duplicate": {
      const result = duplicateBuilderNode(input);
      if (!result.ok) {
        return {
          ok: false,
          operation: input.operation,
          code: result.code,
          message: result.message,
          issues: result.issues,
        };
      }
      return {
        ok: true,
        operation: input.operation,
        tree: result.tree,
        nodeId: result.nodeId,
      };
    }
    case "paste": {
      const result = pasteBuilderNode(input);
      if (!result.ok) {
        return {
          ok: false,
          operation: input.operation,
          code: result.code,
          message: result.message,
          issues: result.issues,
        };
      }
      return {
        ok: true,
        operation: input.operation,
        tree: result.tree,
        nodeId: result.nodeId,
      };
    }
    case "patch": {
      const result = patchBuilderNodeProps(input);
      if (!result.ok) {
        return {
          ok: false,
          operation: input.operation,
          code: result.code,
          message: result.message,
          issues: result.issues,
        };
      }
      return { ok: true, operation: input.operation, tree: result.tree };
    }
    default:
      return {
        ok: false,
        operation: "patch",
        code: "VALIDATION_FAILED",
        message: "Unknown builder-node operation.",
      };
  }
}
