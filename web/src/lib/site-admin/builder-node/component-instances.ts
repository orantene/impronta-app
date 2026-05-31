import type { BuilderNode, BuilderNodeTree } from "./types";
import { cloneNodeWithFreshIds } from "./operations";

/**
 * Living Components Phase 2 — linked instances.
 *
 * An instance is a `container` node tagged with `props.instanceOf = <componentId>`.
 * It renders exactly like any other container (its own stored children), so it is
 * INERT on the published page — nothing here touches the renderer or the publish
 * guards. The "link" is realised purely as an editor-time operation: when the
 * master component changes, `syncComponentInstances` walks the page tree and
 * replaces every matching instance's children with a fresh-id clone of the
 * master's children.
 *
 * This whole module is pure (tree in → tree out), so it is exhaustively
 * unit-testable without a browser — which is the point: the risky part (tree
 * mutation) gets real verification even when the live QA env is unavailable.
 */

export interface SyncComponentInstancesResult {
  tree: BuilderNodeTree;
  /** How many instance nodes were re-synced. */
  synced: number;
}

function isInstanceOf(node: BuilderNode, componentId: string): boolean {
  return (
    node.kind === "container" &&
    typeof node.props.instanceOf === "string" &&
    node.props.instanceOf === componentId
  );
}

/**
 * Return a new tree in which every `container` tagged `instanceOf === componentId`
 * has its children replaced by fresh-id clones of `masterChildren`. The instance
 * node keeps its own id, position and props (including the `instanceOf` tag) — only
 * its children are replaced. Matching nodes are NOT recursed into (their children
 * are freshly minted from the master), which also makes a self-referential master
 * safe: we never walk into the just-cloned subtree.
 */
export function syncComponentInstances(
  tree: BuilderNodeTree,
  componentId: string,
  masterChildren: ReadonlyArray<BuilderNode>,
): SyncComponentInstancesResult {
  let synced = 0;

  const visit = (node: BuilderNode): BuilderNode => {
    if (isInstanceOf(node, componentId)) {
      synced += 1;
      const freshChildren = masterChildren.map((child) =>
        cloneNodeWithFreshIds(child),
      );
      return { ...node, children: freshChildren } as BuilderNode;
    }
    if ("children" in node && Array.isArray(node.children)) {
      return { ...node, children: node.children.map(visit) } as BuilderNode;
    }
    return node;
  };

  return { tree: tree.map(visit), synced };
}

/**
 * Count how many instances of a component exist in the tree (for UI affordances
 * like "Sync 3 instances"). Pure read.
 */
export function countComponentInstances(
  tree: BuilderNodeTree,
  componentId: string,
): number {
  let count = 0;
  const visit = (node: BuilderNode): void => {
    if (isInstanceOf(node, componentId)) {
      count += 1;
      return; // don't recurse into an instance's own subtree
    }
    if ("children" in node && Array.isArray(node.children)) {
      node.children.forEach(visit);
    }
  };
  tree.forEach(visit);
  return count;
}

/**
 * Tag a freshly-cloned component root as an instance of `componentId`. Only
 * `container` roots can carry the marker; other kinds are returned unchanged
 * (they insert as a plain unlinked copy, exactly like Phase 1).
 */
export function tagAsInstance(
  node: BuilderNode,
  componentId: string,
): BuilderNode {
  if (node.kind !== "container") return node;
  return {
    ...node,
    props: { ...node.props, instanceOf: componentId },
  } as BuilderNode;
}

export interface DetachInstanceResult {
  tree: BuilderNodeTree;
  /** Whether a tagged instance with this id was found and detached. */
  detached: boolean;
}

/**
 * Detach a single instance (by node id): strip its `instanceOf` tag so it
 * becomes a plain, independent container. Its children are left exactly as
 * they are — detaching keeps the current content and only severs the link, so
 * a future "Sync instances" will no longer touch it. Pure.
 */
export function detachComponentInstance(
  tree: BuilderNodeTree,
  nodeId: string,
): DetachInstanceResult {
  let detached = false;

  const visit = (node: BuilderNode): BuilderNode => {
    if (
      node.id === nodeId &&
      node.kind === "container" &&
      typeof node.props.instanceOf === "string"
    ) {
      detached = true;
      const nextProps = { ...node.props };
      delete (nextProps as { instanceOf?: string }).instanceOf;
      return { ...node, props: nextProps } as BuilderNode;
    }
    if ("children" in node && Array.isArray(node.children)) {
      return { ...node, children: node.children.map(visit) } as BuilderNode;
    }
    return node;
  };

  return { tree: tree.map(visit), detached };
}
