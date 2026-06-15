import { BUILDER_NODE_REGISTRY } from "./registry";
import { builderNodeKindAllowedAtRoot } from "./drop-policy";
import {
  buildConvertedTextNode,
  builderTextRoleSupported,
  resolveBuilderTextRoleFromNode,
  type BuilderTextRoleId,
} from "./text-role";
import type { BuilderNode, BuilderNodeTree } from "./types";
import { randomUuid } from "./make-id";
import { syncBaseNodeFieldsFromProps, validateBuilderNodeTree } from "./validate";
import { stripLockedKeysFromPatch } from "./prop-lock";

export type BuilderNodeOpCode =
  | "NODE_NOT_FOUND"
  | "NODE_KIND_NOT_DUPLICABLE"
  | "PARENT_NOT_FOUND"
  | "PARENT_DOES_NOT_ALLOW_CHILDREN"
  | "ROOT_KIND_NOT_ALLOWED"
  | "CHILD_KIND_NOT_ALLOWED"
  | "INVALID_MOVE_TARGET"
  | "VALIDATION_FAILED"
  | "NO_CHANGE";

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

/**
 * Copy-on-write spine rebuild — the perf keystone of the canvas editor.
 *
 * Returns a NEW top-level array in which only the root→`path` spine is rebuilt:
 * the node at each step along `path` is shallow-copied (fresh identity) and its
 * `children` array is shallow-copied (so a downstream `splice` never touches the
 * original), while EVERY off-path sibling subtree keeps its ORIGINAL object
 * reference. The node addressed by `path` itself is shallow-copied with a fresh
 * `children` array (when it has one), so callers can either reassign its `props`
 * (patch) or splice its `children` (insert/move target) without mutating any
 * object that existed in the input tree.
 *
 * The canvas renderer wraps each node in `React.memo` keyed by identity
 * (`Object.is`), so sharing the off-path references makes every memo'd node that
 * isn't on the edited spine skip re-render — a deep text edit no longer repaints
 * the whole page (the old `cloneTree` gave every node a fresh identity → 100%
 * memo miss). `getNodeByPath`/`getChildrenRefAtPath` resolve the freshly-copied
 * containers/target on the returned tree, so the existing mutation code is
 * unchanged below the clone.
 *
 * INVARIANT: only freshly-created spine objects are ever written to. An empty
 * `path` copies just the top-level array (e.g. a root-level insert/remove).
 */
function copyPathToTarget(
  nodes: ReadonlyArray<BuilderNode>,
  path: ReadonlyArray<number>,
): BuilderNodeTree {
  const next = nodes.slice();
  if (path.length === 0) return next;

  const headIndex = path[0]!;
  const original = next[headIndex];
  if (!original) return next;

  const copied = { ...original } as BuilderNode;
  if ("children" in original && Array.isArray(original.children)) {
    const restPath = path.slice(1);
    (copied as BuilderNode & { children: BuilderNode[] }).children =
      restPath.length === 0
        ? original.children.slice()
        : copyPathToTarget(original.children, restPath);
  }
  next[headIndex] = copied;
  return next;
}

function freshNodeId(kind: BuilderNode["kind"]): string {
  return `${kind}-${randomUuid()}`;
}

export function cloneNodeWithFreshIds(
  node: BuilderNode,
  idMap: Map<string, string> = new Map(),
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

function allowedChildKindsSummary(parentKind: BuilderNode["kind"]): string {
  const policy = BUILDER_NODE_REGISTRY[parentKind].children;
  if (policy.type === "none") return "none";
  if (policy.type === "any") return "any";
  return policy.kinds.join(", ");
}

function subtreeContainsId(node: BuilderNode, nodeId: string): boolean {
  if (node.id === nodeId) return true;
  if (!("children" in node) || !Array.isArray(node.children)) return false;
  return node.children.some((child) => subtreeContainsId(child, nodeId));
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!valuesEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (typeof a === "object" && typeof b === "object") {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (!(key in bObj)) return false;
      if (!valuesEqual(aObj[key], bObj[key])) return false;
    }
    return true;
  }

  return false;
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

/**
 * Finalize a structural mutation. Validates the resulting tree, but judges the
 * operation by whether IT introduced new corruption — not by damage that was
 * already present in the input.
 *
 * Why this isn't a plain "reject if any node is invalid": validation fails the
 * whole tree if a SINGLE node is bad. A lone pre-existing corrupt node
 * (classically a legacy `section` whose `sectionId` is not a UUID, from old
 * seed data) would otherwise make every insert / move / remove / patch fail —
 * trapping the editor, who can't even delete the offending node because the
 * delete re-validates the whole tree and trips on the same corruption.
 *
 * Rule — compare the issue count before vs. after the mutation:
 *   - The op added net-new issues → reject (its own output is unsound).
 *   - No net-new issues           → accept the REPAIRED tree (corrupt nodes
 *     dropped). Repairing rather than preserving matters: the snapshot loader
 *     discards an invalid `builderTree` wholesale back to legacy slots, so
 *     returning a valid tree is what keeps the editor's freeform work alive.
 *
 * Soundness of the count rule for these five operations: none can fix a
 * pre-existing issue while introducing a different one in the same call
 * (patch touches one node; insert/duplicate add a pre-validated node; remove
 * only drops; move is target-policy-checked before this runs). So
 * `afterCount === beforeCount` ⟹ the same nodes are corrupt ⟹ the repair drops
 * only pre-existing-corrupt nodes, never the user's just-edited one.
 *
 * When the input is already clean (the common case) `beforeCount` is 0, so any
 * new issue rejects — identical to the previous strict behavior.
 */
function finalizeMutatedTree(
  originalTree: BuilderNodeTree,
  nextTree: BuilderNodeTree,
): BuilderNodeOpResult {
  const after = validateBuilderNodeTree(nextTree);
  if (after.ok) {
    // Clean validation (the common case): return the COPY-ON-WRITE `nextTree`,
    // NOT `validateBuilderNodeTree`'s `after.tree`. `after.tree` re-mints every
    // node (fresh identity), which defeats the copy-on-write spine — the canvas
    // memo keys on `Object.is(node)`, so a re-minted tree forces a full repaint.
    // Returning `nextTree` preserves the shared off-path references so memo'd
    // nodes off the edited path skip re-render.
    //
    // Two things validate would otherwise do on this pass, and how we handle the
    // gap: (1) re-derive the base-mirror fields (locked/visibilityCondition) from
    // props — the prop-mutating ops (patch / role-convert) call
    // `syncBaseNodeFieldsFromProps` on the one node they touched, so the mirror
    // stays correct; (2) strip undeclared prop keys — harmless, and re-stripped
    // on the next snapshot reload. The accept/reject/heal DECISION below is
    // unchanged; only the success path hands back the structurally-shared tree.
    return { ok: true, tree: nextTree };
  }
  const before = validateBuilderNodeTree(originalTree);
  const preExistingCount = before.ok ? 0 : before.issues.length;
  if (after.issues.length > preExistingCount) {
    return {
      ok: false,
      code: "VALIDATION_FAILED",
      message: "Builder node tree failed validation after operation.",
      issues: after.issues,
    };
  }
  // Only pre-existing corruption remains — heal instead of trapping the
  // editor. `after.tree` is the repaired tree (corrupt nodes dropped) and is
  // guaranteed to pass validation.
  return { ok: true, tree: after.tree };
}

function missingNodeIssue(nodeId: string): ReadonlyArray<{ path: string; message: string }> {
  return [
    {
      path: "source.nodeId",
      message: `Missing node id "${nodeId}". Refresh and retry.`,
    },
  ];
}

export function insertBuilderNode(input: {
  tree: BuilderNodeTree;
  node: BuilderNode;
  parentId: string | null;
  index?: number;
}): BuilderNodeOpResult {
  let targetPath: number[] = [];
  let parentKind: BuilderNode["kind"] | null = null;

  if (input.parentId) {
    const parent = findNodeLocation(input.tree, input.parentId);
    if (!parent) {
      return {
        ok: false,
        code: "PARENT_NOT_FOUND",
        message: `Parent node "${input.parentId}" was not found.`,
        issues: [
          {
            path: "target.parentId",
            message: `Missing parent id "${input.parentId}". Refresh and retry.`,
          },
        ],
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
        issues: [
          {
            path: "target.parent",
            message: `Parent kind "${parent.node.kind}" does not allow nested blocks.`,
          },
        ],
      };
    }
    if (!childAllowed(parent.node.kind, input.node.kind)) {
      return {
        ok: false,
        code: "CHILD_KIND_NOT_ALLOWED",
        message: `Child kind "${input.node.kind}" is not allowed under "${parent.node.kind}".`,
        issues: [
          {
            path: "target.parent",
            message: `Allowed child kinds: ${allowedChildKindsSummary(parent.node.kind)}.`,
          },
        ],
      };
    }
  } else if (!builderNodeKindAllowedAtRoot(input.node.kind)) {
    return {
      ok: false,
      code: "ROOT_KIND_NOT_ALLOWED",
      message: `Root cannot contain node kind "${input.node.kind}".`,
      issues: [
        {
          path: "target.root",
          message: `Move this block into a section/container instead of page root.`,
        },
      ],
    };
  }

  const nextTree = copyPathToTarget(input.tree, targetPath);
  const targetChildren = getChildrenRefAtPath(nextTree, targetPath);
  if (!targetChildren) {
    return {
      ok: false,
      code: "PARENT_DOES_NOT_ALLOW_CHILDREN",
      message: "Target parent does not support child insertion.",
      issues: [
        {
          path: "target.parent",
          message: "Choose a section/container/accordion/tabs node as parent.",
        },
      ],
    };
  }
  if (parentKind && !childAllowed(parentKind, input.node.kind)) {
    return {
      ok: false,
      code: "CHILD_KIND_NOT_ALLOWED",
      message: `Child kind "${input.node.kind}" is not allowed under "${parentKind}".`,
      issues: [
        {
          path: "target.parent",
          message: `Allowed child kinds: ${allowedChildKindsSummary(parentKind)}.`,
        },
      ],
    };
  }
  const rawIndex = input.index ?? targetChildren.length;
  const nextIndex = Math.max(0, Math.min(rawIndex, targetChildren.length));
  targetChildren.splice(nextIndex, 0, cloneNode(input.node));
  return finalizeMutatedTree(input.tree, nextTree);
}

export function removeBuilderNode(input: {
  tree: BuilderNodeTree;
  nodeId: string;
}): BuilderNodeOpResult {
  const location = findNodeLocation(input.tree, input.nodeId);
  if (!location) {
    return {
      ok: false,
      code: "NODE_NOT_FOUND",
      message: `Node "${input.nodeId}" was not found.`,
      issues: missingNodeIssue(input.nodeId),
    };
  }
  if (removingWouldEmptyRequiredGroup(input.tree, location)) {
    return {
      ok: false,
      code: "INVALID_MOVE_TARGET",
      message: `Cannot remove the last ${location.node.kind === "accordion_item" ? "accordion item" : "tab panel"}.`,
      issues: [
        {
          path: "source.group",
          message:
            "Add another item to this accordion/tabs group before removing this one.",
        },
      ],
    };
  }
  const nextTree = copyPathToTarget(input.tree, location.parentPath);
  const parentChildren = getChildrenRefAtPath(nextTree, location.parentPath);
  if (!parentChildren) {
    return {
      ok: false,
      code: "INVALID_MOVE_TARGET",
      message: "Unable to resolve the node parent list for removal.",
      issues: [
        {
          path: "source.parent",
          message: "The source parent could not be resolved. Refresh and retry.",
        },
      ],
    };
  }
  parentChildren.splice(location.index, 1);
  return finalizeMutatedTree(input.tree, nextTree);
}

export function duplicateBuilderNode(input: {
  tree: BuilderNodeTree;
  nodeId: string;
}): BuilderNodeDuplicateResult {
  const location = findNodeLocation(input.tree, input.nodeId);
  if (!location) {
    return {
      ok: false,
      code: "NODE_NOT_FOUND",
      message: `Node "${input.nodeId}" was not found.`,
      issues: missingNodeIssue(input.nodeId),
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
      issues: [
        {
          path: "target.root",
          message: "Duplicate this block inside a section/container instead.",
        },
      ],
    };
  }

  const nextTree = copyPathToTarget(input.tree, location.parentPath);
  const parentChildren = getChildrenRefAtPath(nextTree, location.parentPath);
  if (!parentChildren) {
    return {
      ok: false,
      code: "INVALID_MOVE_TARGET",
      message: "Unable to resolve the node parent list for duplication.",
      issues: [
        {
          path: "source.parent",
          message: "The source parent could not be resolved. Refresh and retry.",
        },
      ],
    };
  }
  const idMap = new Map<string, string>();
  const duplicate = cloneNodeWithFreshIds(location.node, idMap);
  parentChildren.splice(location.index + 1, 0, duplicate);

  // Same resilience contract as the other mutators: a pre-existing corrupt
  // sibling must not block duplication, and the result must be a valid
  // (repaired) tree. `duplicate` carries fresh ids and clones a node that was
  // already in the tree, so it always survives the repair.
  const result = finalizeMutatedTree(input.tree, nextTree);
  if (!result.ok) return result;
  return { ok: true, tree: result.tree, nodeId: duplicate.id };
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
      issues: missingNodeIssue(input.nodeId),
    };
  }
  if (input.parentId === input.nodeId) {
    return {
      ok: false,
      code: "INVALID_MOVE_TARGET",
      message: "A node cannot be moved into itself.",
      issues: [
        {
          path: "target.parentId",
          message: "Choose a different destination parent.",
        },
      ],
    };
  }
  if (input.parentId && subtreeContainsId(original.node, input.parentId)) {
    return {
      ok: false,
      code: "INVALID_MOVE_TARGET",
      message: "A node cannot be moved into one of its own descendants.",
      issues: [
        {
          path: "target.parentId",
          message:
            "Move the block to a sibling container or to one of its ancestors instead.",
        },
      ],
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
      issues: [
        {
          path: "source.group",
          message:
            "Add another item to this accordion/tabs group before moving this one out.",
        },
      ],
    };
  }
  // Validate destination against the source tree before mutating a clone.
  // Keeps the operation pipeline deterministic and error reporting stable.
  if (input.parentId) {
    const parent = findNodeLocation(input.tree, input.parentId);
    if (!parent) {
      return {
        ok: false,
        code: "PARENT_NOT_FOUND",
        message: `Parent node "${input.parentId}" was not found.`,
        issues: [
          {
            path: "target.parentId",
            message: `Missing parent id "${input.parentId}". Refresh and retry.`,
          },
        ],
      };
    }
    const policy = BUILDER_NODE_REGISTRY[parent.node.kind].children;
    if (policy.type === "none") {
      return {
        ok: false,
        code: "PARENT_DOES_NOT_ALLOW_CHILDREN",
        message: `Parent "${parent.node.id}" does not allow children.`,
        issues: [
          {
            path: "target.parent",
            message: `Parent kind "${parent.node.kind}" does not allow nested blocks.`,
          },
        ],
      };
    }
    if (!childAllowed(parent.node.kind, original.node.kind)) {
      return {
        ok: false,
        code: "CHILD_KIND_NOT_ALLOWED",
        message: `Child kind "${original.node.kind}" is not allowed under "${parent.node.kind}".`,
        issues: [
          {
            path: "target.parent",
            message: `Allowed child kinds: ${allowedChildKindsSummary(parent.node.kind)}.`,
          },
        ],
      };
    }
  } else if (!builderNodeKindAllowedAtRoot(original.node.kind)) {
    return {
      ok: false,
      code: "ROOT_KIND_NOT_ALLOWED",
      message: `Root cannot contain node kind "${original.node.kind}".`,
      issues: [
        {
          path: "target.root",
          message: "Drop this block into a section/container instead of page root.",
        },
      ],
    };
  }

  const moving = findNodeLocation(input.tree, input.nodeId);
  if (!moving) {
    return {
      ok: false,
      code: "NODE_NOT_FOUND",
      message: `Node "${input.nodeId}" was not found.`,
      issues: missingNodeIssue(input.nodeId),
    };
  }
  // Copy-on-write the source spine first, splice the moving node out of the
  // freshly-copied source list, THEN copy-on-write the (possibly index-shifted)
  // target spine on the resulting tree. Each pass shares every off-path subtree
  // reference, so the only objects ever mutated are the fresh spine arrays —
  // the input tree is never touched.
  const afterRemoveTree = copyPathToTarget(input.tree, moving.parentPath);
  const sourceChildren = getChildrenRefAtPath(afterRemoveTree, moving.parentPath);
  if (!sourceChildren) {
    return {
      ok: false,
      code: "INVALID_MOVE_TARGET",
      message: "Unable to resolve the node source list for move.",
      issues: [
        {
          path: "source.parent",
          message: "The source parent could not be resolved. Refresh and retry.",
        },
      ],
    };
  }
  const [removed] = sourceChildren.splice(moving.index, 1);
  if (!removed) {
    return {
      ok: false,
      code: "NODE_NOT_FOUND",
      message: `Node "${input.nodeId}" was not found in source list.`,
      issues: missingNodeIssue(input.nodeId),
    };
  }

  let targetPath: number[] = [];
  let parentKind: BuilderNode["kind"] | null = null;
  if (input.parentId) {
    const parent = findNodeLocation(afterRemoveTree, input.parentId);
    if (!parent) {
      return {
        ok: false,
        code: "PARENT_NOT_FOUND",
        message: `Parent node "${input.parentId}" was not found.`,
        issues: [
          {
            path: "target.parentId",
            message: `Missing parent id "${input.parentId}". Refresh and retry.`,
          },
        ],
      };
    }
    targetPath = parent.path;
    parentKind = parent.node.kind;
  }

  const nextTree = copyPathToTarget(afterRemoveTree, targetPath);
  const targetChildren = getChildrenRefAtPath(nextTree, targetPath);
  if (!targetChildren) {
    return {
      ok: false,
      code: "PARENT_DOES_NOT_ALLOW_CHILDREN",
      message: "Target parent does not support child insertion.",
      issues: [
        {
          path: "target.parent",
          message: "Choose a section/container/accordion/tabs node as parent.",
        },
      ],
    };
  }
  if (parentKind && !childAllowed(parentKind, removed.kind)) {
    return {
      ok: false,
      code: "CHILD_KIND_NOT_ALLOWED",
      message: `Child kind "${removed.kind}" is not allowed under "${parentKind}".`,
      issues: [
        {
          path: "target.parent",
          message: `Allowed child kinds: ${allowedChildKindsSummary(parentKind)}.`,
        },
      ],
    };
  }

  const nextIndex = Math.max(0, Math.min(input.index, targetChildren.length));
  targetChildren.splice(nextIndex, 0, removed);
  return finalizeMutatedTree(input.tree, nextTree);
}

export function patchBuilderNodeProps(input: {
  tree: BuilderNodeTree;
  nodeId: string;
  patch: Record<string, unknown>;
}): BuilderNodeOpResult {
  const location = findNodeLocation(input.tree, input.nodeId);
  if (!location) {
    return {
      ok: false,
      code: "NODE_NOT_FOUND",
      message: `Node "${input.nodeId}" was not found.`,
      issues: missingNodeIssue(input.nodeId),
    };
  }
  // No-op detection runs against the ORIGINAL node's props — byte-for-byte the
  // same comparison as before. Only build the copy-on-write spine once we know
  // there is a real change to apply (avoids a pointless allocation on no-ops).
  const currentProps = location.node.props as Record<string, unknown>;
  // Builder Studio — re-assert admin per-prop locks: strip any locked key from
  // the incoming patch (the server-trusted chokepoint, since a disabled
  // inspector input can still be bypassed programmatically/optimistically).
  const patch = stripLockedKeysFromPatch(
    input.patch,
    currentProps,
    location.node.lockedProps,
  );
  const hasRealChange = Object.entries(patch).some(([key, value]) => {
    return !valuesEqual(currentProps[key], value);
  });
  if (!hasRealChange) {
    // No-op patch — the node already holds these exact values (e.g. re-applying
    // the same style, or a UI gesture that re-sends current props). Benign: a
    // dedicated NO_CHANGE code the UI SUPPRESSES, not the alarming
    // INVALID_MOVE_TARGET ("Choose another destination / move the parent group")
    // toast it used to throw on every no-op edit. ok:false keeps the tree
    // untouched (no redundant save / no re-render loop).
    return {
      ok: false,
      code: "NO_CHANGE",
      message: "No changes to apply.",
      issues: [],
    };
  }
  const nextTree = copyPathToTarget(input.tree, location.path);
  const target = getNodeByPath(nextTree, location.path);
  if (!target) {
    return {
      ok: false,
      code: "NODE_NOT_FOUND",
      message: `Node "${input.nodeId}" was not found for patch.`,
      issues: missingNodeIssue(input.nodeId),
    };
  }
  const mergedProps = {
    ...currentProps,
    ...patch,
  };
  (target as unknown as { props: unknown }).props = mergedProps;
  // Keep the base mirror (locked / visibilityCondition) in sync with the merged
  // props on the one node we touched — finalizeMutatedTree returns the shared
  // tree without the full re-validate that would normally re-derive it.
  syncBaseNodeFieldsFromProps(target);
  return finalizeMutatedTree(input.tree, nextTree);
}

export function convertBuilderTextNodeRole(input: {
  tree: BuilderNodeTree;
  nodeId: string;
  role: BuilderTextRoleId;
}): BuilderNodeOpResult {
  const location = findNodeLocation(input.tree, input.nodeId);
  if (!location) {
    return {
      ok: false,
      code: "NODE_NOT_FOUND",
      message: `Node "${input.nodeId}" was not found.`,
      issues: missingNodeIssue(input.nodeId),
    };
  }
  if (!builderTextRoleSupported(location.node)) {
    return {
      ok: false,
      code: "INVALID_MOVE_TARGET",
      message: "Only heading and paragraph blocks can change text style.",
      issues: [
        {
          path: "target.node",
          message: "Select a heading or paragraph block.",
        },
      ],
    };
  }
  if (resolveBuilderTextRoleFromNode(location.node) === input.role) {
    return {
      ok: false,
      code: "NO_CHANGE",
      message: "No changes to apply.",
      issues: [],
    };
  }
  const nextTree = cloneTree(input.tree);
  const children = getChildrenRefAtPath(nextTree, location.parentPath);
  if (!children) {
    return {
      ok: false,
      code: "NODE_NOT_FOUND",
      message: "Parent container for that text block was not found.",
      issues: missingNodeIssue(input.nodeId),
    };
  }
  const parentKind =
    location.parentPath.length === 0
      ? null
      : getNodeByPath(nextTree, location.parentPath)?.kind ?? null;
  const converted = buildConvertedTextNode(location.node, input.role);
  if (parentKind && !childAllowed(parentKind, converted.kind)) {
    return {
      ok: false,
      code: "CHILD_KIND_NOT_ALLOWED",
      message: `Child kind "${converted.kind}" is not allowed under "${parentKind}".`,
      issues: [
        {
          path: "target.parent",
          message: `Allowed child kinds: ${allowedChildKindsSummary(parentKind)}.`,
        },
      ],
    };
  }
  children[location.index] = converted;
  syncBaseNodeFieldsFromProps(converted);
  return finalizeMutatedTree(input.tree, nextTree);
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
