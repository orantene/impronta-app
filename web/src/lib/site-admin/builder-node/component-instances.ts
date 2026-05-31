import type {
  BuilderNode,
  BuilderNodeTree,
  BuilderNodeInstanceOverride,
} from "./types";
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

// ── Phase 3: live-render resolution ──────────────────────────────────────────

/** A map of componentId → the saved component's subtree ROOT node. */
export type ComponentDefinitions = Record<string, BuilderNode>;

/**
 * Does this tree contain ANY linked instance (a container with instanceOf)?
 * Lets the published render skip the component-definitions DB query entirely on
 * the common case (pages with no instances). Pure read.
 */
export function treeHasInstances(
  nodes: ReadonlyArray<BuilderNode>,
): boolean {
  const visit = (node: BuilderNode): boolean => {
    if (node.kind === "container" && typeof node.props.instanceOf === "string") {
      return true;
    }
    if ("children" in node && Array.isArray(node.children)) {
      return node.children.some(visit);
    }
    return false;
  };
  return nodes.some(visit);
}

/**
 * Apply a per-instance override to a single node's text-bearing / media props,
 * by kind. Returns a new node (never mutates). Unknown kinds are returned
 * unchanged. Empty-string overrides are ignored (treated as "not overridden")
 * so a blank field never wipes the master content.
 */
function applyOverride(
  node: BuilderNode,
  override: BuilderNodeInstanceOverride | undefined,
): BuilderNode {
  if (!override) return node;
  const props = node.props as Record<string, unknown>;
  const next: Record<string, unknown> = { ...props };
  let changed = false;
  if (override.text && (node.kind === "heading" || node.kind === "paragraph")) {
    next.text = override.text;
    changed = true;
  }
  if (override.text && node.kind === "button") {
    next.label = override.text;
    changed = true;
  }
  if (override.href && node.kind === "button") {
    next.href = override.href;
    changed = true;
  }
  if (node.kind === "image") {
    if (override.imageSrc) {
      next.src = override.imageSrc;
      changed = true;
    }
    if (override.imageAlt) {
      next.alt = override.imageAlt;
      changed = true;
    }
  }
  return changed ? ({ ...node, props: next } as BuilderNode) : node;
}

/**
 * Recursively rebuild a master subtree node for live rendering inside one
 * instance: namespace ids (so N instances of the same component don't collide
 * on React keys / data-builder-node-id) and layer per-instance overrides keyed
 * by the ORIGINAL master node id. Pure.
 *
 * Accordion / tabs cross-reference props (defaultOpenItemIds, defaultTabId) are
 * also remapped to namespaced ids so "open by default" state works correctly
 * in the live-rendered tree.
 */
function materializeForInstance(
  node: BuilderNode,
  instanceId: string,
  overrides: Record<string, BuilderNodeInstanceOverride>,
): BuilderNode {
  const overridden = applyOverride(node, overrides[node.id]);
  const namespacedId = `${instanceId}__${node.id}`;
  if (!("children" in overridden) || !Array.isArray(overridden.children)) {
    return { ...overridden, id: namespacedId } as BuilderNode;
  }

  const props = overridden.props as Record<string, unknown>;
  let nextProps: Record<string, unknown> = { ...props };

  // Accordion: remap defaultOpenItemIds so "open by default" targets the
  // namespaced accordion_item ids, not the stale master ids.
  if (
    overridden.kind === "accordion" &&
    Array.isArray(props.defaultOpenItemIds)
  ) {
    nextProps = {
      ...nextProps,
      defaultOpenItemIds: (props.defaultOpenItemIds as string[]).map(
        (id) => `${instanceId}__${id}`,
      ),
    };
  }

  // Tabs: remap defaultTabId so the default-selected panel matches its
  // namespaced id in the rendered tree.
  if (overridden.kind === "tabs" && typeof props.defaultTabId === "string") {
    nextProps = {
      ...nextProps,
      defaultTabId: `${instanceId}__${props.defaultTabId}`,
    };
  }

  return {
    ...overridden,
    id: namespacedId,
    props: nextProps,
    children: overridden.children.map((child) =>
      materializeForInstance(child, instanceId, overrides),
    ),
  } as BuilderNode;
}

/** An overridable slot in a master component — surfaced in the editor's
 * "Instance overrides" panel so an operator can swap text / image / link per
 * instance without touching the master. */
export interface OverridableSlot {
  /** The MASTER child node id — the override key. */
  masterId: string;
  kind: "heading" | "paragraph" | "button" | "image";
  /** Which override field this slot edits. */
  field: "text" | "imageSrc";
  /** Whether this slot also supports an href override (buttons). */
  supportsHref: boolean;
  /** The master's current value, shown as the placeholder / default. */
  defaultValue: string;
}

/**
 * Walk a master component subtree and collect its overridable slots (text on
 * heading/paragraph/button; src on image). Order is stable (depth-first) so the
 * panel lists slots top-to-bottom. Pure read.
 */
export function collectOverridableSlots(
  master: BuilderNode,
): OverridableSlot[] {
  const slots: OverridableSlot[] = [];
  const visit = (node: BuilderNode): void => {
    const p = node.props as Record<string, unknown>;
    if (node.kind === "heading" || node.kind === "paragraph") {
      slots.push({ masterId: node.id, kind: node.kind, field: "text", supportsHref: false, defaultValue: String(p.text ?? "") });
    } else if (node.kind === "button") {
      slots.push({ masterId: node.id, kind: "button", field: "text", supportsHref: true, defaultValue: String(p.label ?? "") });
    } else if (node.kind === "image") {
      slots.push({ masterId: node.id, kind: "image", field: "imageSrc", supportsHref: false, defaultValue: String(p.src ?? "") });
    }
    if ("children" in node && Array.isArray(node.children)) node.children.forEach(visit);
  };
  visit(master);
  return slots;
}

/**
 * Set (or clear, when override is null/empty) a single per-instance override on
 * the instance container with id `nodeId`. Empty overrides are pruned so the
 * stored map stays minimal. Pure tree-in/tree-out.
 */
export function setInstanceOverride(
  tree: BuilderNodeTree,
  nodeId: string,
  masterChildId: string,
  override: BuilderNodeInstanceOverride | null,
): BuilderNodeTree {
  const isEmpty = (o: BuilderNodeInstanceOverride | null): boolean =>
    !o || (!o.text && !o.imageSrc && !o.imageAlt && !o.href);

  const visit = (node: BuilderNode): BuilderNode => {
    if (node.id === nodeId && node.kind === "container") {
      const current = { ...(node.props.instanceOverrides ?? {}) };
      if (isEmpty(override)) {
        delete current[masterChildId];
      } else {
        current[masterChildId] = override as BuilderNodeInstanceOverride;
      }
      const nextProps = { ...node.props };
      if (Object.keys(current).length > 0) {
        nextProps.instanceOverrides = current;
      } else {
        delete (nextProps as { instanceOverrides?: unknown }).instanceOverrides;
      }
      return { ...node, props: nextProps } as BuilderNode;
    }
    if ("children" in node && Array.isArray(node.children)) {
      return { ...node, children: node.children.map(visit) } as BuilderNode;
    }
    return node;
  };
  return tree.map(visit);
}

/**
 * Resolve the children a linked instance should render LIVE from its master
 * component, with per-instance overrides applied. Returns:
 *   - the resolved children array when the node is a tagged instance AND the
 *     component definition is available;
 *   - null otherwise — the caller MUST fall back to the instance's own stored
 *     children, so a missing/deleted component or un-loaded definitions can
 *     never blank a published page.
 *
 * Pure (master + instance in → fresh nodes out; neither is mutated).
 */
export function resolveInstanceChildren(
  instanceNode: BuilderNode,
  components: ComponentDefinitions,
): BuilderNode[] | null {
  if (instanceNode.kind !== "container") return null;
  const componentId = instanceNode.props.instanceOf;
  if (!componentId) return null;
  const master = components[componentId];
  if (!master) return null;
  const masterChildren =
    "children" in master && Array.isArray(master.children)
      ? master.children
      : [];
  const overrides = instanceNode.props.instanceOverrides ?? {};
  return masterChildren.map((child) =>
    materializeForInstance(child, instanceNode.id, overrides),
  );
}
