import type {
  BuilderNode,
  BuilderNodeTree,
  BuilderNodeInstanceOverride,
  BuilderNodeStyleValue,
  BuilderComponentVariant,
} from "./types";
import { cloneNodeWithFreshIds } from "./operations";
import { resolveBuilderNodeRole } from "./role-bindings";

/**
 * The node kinds that can be a linked-component INSTANCE ROOT. Phase 2/3 only
 * allowed `container`; Phase 4 (T4.4) also allows `card` (the most common
 * reusable editorial unit). Both carry a `children` array, so the live
 * children-resolution path (resolveInstanceChildren) works on either unchanged.
 * A node is an instance only if it carries `props.instanceOf`.
 */
export const INSTANCE_ROOT_KINDS = ["container", "card"] as const;

/** Is this node kind allowed to be a linked-component instance root? */
function isInstanceRootKind(
  kind: BuilderNode["kind"],
): kind is (typeof INSTANCE_ROOT_KINDS)[number] {
  return kind === "container" || kind === "card";
}

/** Read the `instanceOf` marker off any instance-root node (container | card). */
function readInstanceOf(node: BuilderNode): string | undefined {
  if (!isInstanceRootKind(node.kind)) return undefined;
  const props = node.props as { instanceOf?: string };
  return typeof props.instanceOf === "string" ? props.instanceOf : undefined;
}

/** Read the per-instance override map off any instance-root node. */
function readInstanceOverrides(
  node: BuilderNode,
): Record<string, BuilderNodeInstanceOverride> {
  if (!isInstanceRootKind(node.kind)) return {};
  const props = node.props as {
    instanceOverrides?: Record<string, BuilderNodeInstanceOverride>;
  };
  return props.instanceOverrides ?? {};
}

/**
 * An override is "empty" (and thus pruned from storage) when none of its fields
 * carries content: blank scalars, an empty `style` object, and an empty `slots`
 * map all count as empty so a cleared field never bloats the stored map.
 */
function isEmptyOverride(o: BuilderNodeInstanceOverride | null): boolean {
  if (!o) return true;
  if (o.text || o.imageSrc || o.imageAlt || o.href) return false;
  if (o.style && Object.keys(o.style).length > 0) return false;
  if (o.slots && Object.keys(o.slots).length > 0) return false;
  return true;
}

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
  return readInstanceOf(node) === componentId;
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
 * INSTANCE_ROOT_KINDS (container | card — Phase 4) can carry the marker; other
 * kinds are returned unchanged (they insert as a plain unlinked copy, exactly
 * like Phase 1).
 */
export function tagAsInstance(
  node: BuilderNode,
  componentId: string,
): BuilderNode {
  if (!isInstanceRootKind(node.kind)) return node;
  return {
    ...node,
    props: { ...node.props, instanceOf: componentId },
  } as BuilderNode;
}

/**
 * Instance roots are container/card only. Convert wraps any other kind in a
 * stack container so the canvas node can carry `instanceOf`.
 */
export function wrapNodeAsInstanceRoot(
  node: BuilderNode,
  wrapId: string,
): BuilderNode {
  if (isInstanceRootKind(node.kind)) return node;
  return {
    id: wrapId,
    kind: "container",
    props: { layout: "stack", gap: "m" },
    children: [node],
  } as BuilderNode;
}

export function canConvertNodeToComponent(
  node: BuilderNode,
): { ok: true } | { ok: false; error: string } {
  if (node.kind === "section") {
    return {
      ok: false,
      error: "Whole sections can't be saved as a block — pick a block inside it.",
    };
  }
  if (node.locked === true) {
    return { ok: false, error: "Locked blocks can't become components." };
  }
  if (resolveBuilderNodeRole(node.id)) {
    return {
      ok: false,
      error: "Role-bound blocks can't become components.",
    };
  }
  return { ok: true };
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
    if (node.id === nodeId && readInstanceOf(node)) {
      detached = true;
      const nextProps = { ...node.props };
      delete (nextProps as { instanceOf?: string }).instanceOf;
      // Drop the now-meaningless variant tag too; the override map is kept so the
      // detached node retains its current content/style (just severs the link).
      delete (nextProps as { instanceVariant?: string }).instanceVariant;
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
    if (readInstanceOf(node)) return true;
    if ("children" in node && Array.isArray(node.children)) {
      return node.children.some(visit);
    }
    return false;
  };
  return nodes.some(visit);
}

/**
 * Apply a per-instance override to a single node's text-bearing / media / STYLE
 * props, by kind. Returns a new node (never mutates). Unknown kinds keep their
 * content but can still receive a `style` override (any node carries a style
 * prop). Empty-string scalar overrides are ignored (treated as "not overridden")
 * so a blank field never wipes the master content; an empty `style` object is
 * likewise a no-op.
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
  // Phase 4 (T4.4) — STYLE override. Layer the curated breakpoint-less value
  // OVER the master child's own base style (the override wins at the base
  // layer; the master's responsive/hover/container-query layers are preserved).
  // Any node kind carries a `style` prop, so this is kind-agnostic.
  if (override.style && Object.keys(override.style).length > 0) {
    const baseStyle = (props.style ?? {}) as Record<string, unknown>;
    next.style = { ...baseStyle, ...(override.style as BuilderNodeStyleValue) };
    changed = true;
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
 *
 * Phase 4 (T4.4) — a node's override may carry a nested `slots` map keyed by
 * DEEPER master descendant ids. Those entries are merged into the override map
 * passed to this node's children, so an instance can override grandchildren
 * without the top-level map going flat. The nested slot is MORE SPECIFIC (scoped
 * under its parent), so it is spread last and refines/wins over any flat
 * top-level entry for the same id. Pages with no `slots` are unaffected — the
 * flat top-level map is used verbatim.
 */
function materializeForInstance(
  node: BuilderNode,
  instanceId: string,
  overrides: Record<string, BuilderNodeInstanceOverride>,
): BuilderNode {
  const ownOverride = overrides[node.id];
  const overridden = applyOverride(node, ownOverride);
  const namespacedId = `${instanceId}__${node.id}`;
  if (!("children" in overridden) || !Array.isArray(overridden.children)) {
    return { ...overridden, id: namespacedId } as BuilderNode;
  }

  // Fold this node's nested `slots` into the override map its children see.
  const childOverrides = ownOverride?.slots
    ? { ...overrides, ...ownOverride.slots }
    : overrides;

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
      materializeForInstance(child, instanceId, childOverrides),
    ),
  } as BuilderNode;
}

/** Node kinds a slot can target. Content slots (text/image) carry an editable
 * value; layout kinds (container/card) are style-only slots. */
export type OverridableSlotKind =
  | "heading"
  | "paragraph"
  | "button"
  | "image"
  | "container"
  | "card";

/** An overridable slot in a master component — surfaced in the editor's
 * "Instance overrides" panel so an operator can swap text / image / link AND/OR
 * restyle per instance without touching the master. */
export interface OverridableSlot {
  /** The MASTER child node id — the override key. */
  masterId: string;
  kind: OverridableSlotKind;
  /** Which override field this slot edits ("style" = style-only slot). */
  field: "text" | "imageSrc" | "style";
  /** Whether this slot also supports an href override (buttons). */
  supportsHref: boolean;
  /** Whether this slot also supports a per-instance STYLE override (Phase 4).
   * True for every visible kind — any node carries a style prop. */
  supportsStyle: boolean;
  /** The master's current value, shown as the placeholder / default. */
  defaultValue: string;
}

/**
 * Walk a master component subtree and collect its overridable slots (text on
 * heading/paragraph/button; src on image; STYLE-only on container/card). Order
 * is stable (depth-first) so the panel lists slots top-to-bottom. Pure read.
 *
 * Phase 4 (T4.4): every content slot also `supportsStyle`, and bare
 * container/card nodes appear as style-only slots so an instance can restyle a
 * wrapper (background, padding, radius…) without forking the master.
 */
export function collectOverridableSlots(
  master: BuilderNode,
): OverridableSlot[] {
  const slots: OverridableSlot[] = [];
  const visit = (node: BuilderNode): void => {
    const p = node.props as Record<string, unknown>;
    if (node.kind === "heading" || node.kind === "paragraph") {
      slots.push({ masterId: node.id, kind: node.kind, field: "text", supportsHref: false, supportsStyle: true, defaultValue: String(p.text ?? "") });
    } else if (node.kind === "button") {
      slots.push({ masterId: node.id, kind: "button", field: "text", supportsHref: true, supportsStyle: true, defaultValue: String(p.label ?? "") });
    } else if (node.kind === "image") {
      slots.push({ masterId: node.id, kind: "image", field: "imageSrc", supportsHref: false, supportsStyle: true, defaultValue: String(p.src ?? "") });
    } else if (node.kind === "container" || node.kind === "card") {
      // Style-only slot: a wrapper an instance can recolor / re-pad / re-radius.
      slots.push({ masterId: node.id, kind: node.kind, field: "style", supportsHref: false, supportsStyle: true, defaultValue: "" });
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
  const visit = (node: BuilderNode): BuilderNode => {
    if (node.id === nodeId && isInstanceRootKind(node.kind)) {
      const props = node.props as {
        instanceOverrides?: Record<string, BuilderNodeInstanceOverride>;
      };
      const current = { ...(props.instanceOverrides ?? {}) };
      if (isEmptyOverride(override)) {
        delete current[masterChildId];
      } else {
        current[masterChildId] = override as BuilderNodeInstanceOverride;
      }
      const nextProps = { ...node.props } as Record<string, unknown>;
      if (Object.keys(current).length > 0) {
        nextProps.instanceOverrides = current;
      } else {
        delete nextProps.instanceOverrides;
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
  // Phase 4 (T4.4) — container OR card may be an instance root.
  const componentId = readInstanceOf(instanceNode);
  if (!componentId) return null;
  const master = components[componentId];
  if (!master) return null;
  const masterChildren =
    "children" in master && Array.isArray(master.children)
      ? master.children
      : [];
  const overrides = readInstanceOverrides(instanceNode);
  return masterChildren.map((child) =>
    materializeForInstance(child, instanceNode.id, overrides),
  );
}

// ── Phase 4 (T4.4): component VARIANTS ───────────────────────────────────────

/**
 * Apply a named variant to a single linked instance (by node id). A variant is
 * a PRESET set of overrides keyed by master child id; applying it:
 *   - writes the variant's overrides onto the instance's `instanceOverrides`
 *     map (empty entries pruned, so it stays minimal), and
 *   - records the variant id in `instanceVariant` so the editor can show which
 *     preset is active.
 *
 * Because a variant compiles down to the same override map the live render path
 * already consumes, resolveInstanceChildren is entirely unchanged — variants are
 * an author-time convenience, not a new render concept. Pure tree-in/tree-out;
 * a no-op for a non-matching / non-instance id.
 */
export function applyVariantToInstance(
  tree: BuilderNodeTree,
  nodeId: string,
  variant: BuilderComponentVariant,
): BuilderNodeTree {
  const nextOverrides: Record<string, BuilderNodeInstanceOverride> = {};
  for (const [masterId, ov] of Object.entries(variant.overrides)) {
    if (!isEmptyOverride(ov)) nextOverrides[masterId] = ov;
  }

  const visit = (node: BuilderNode): BuilderNode => {
    if (node.id === nodeId && readInstanceOf(node)) {
      const nextProps = { ...node.props } as Record<string, unknown>;
      if (Object.keys(nextOverrides).length > 0) {
        nextProps.instanceOverrides = nextOverrides;
      } else {
        delete nextProps.instanceOverrides;
      }
      nextProps.instanceVariant = variant.id;
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
 * Clear the active variant tag on an instance WITHOUT touching its resolved
 * overrides (the operator may have hand-tweaked them since). Returns a fresh
 * tree; a no-op for a non-matching id. Pure.
 */
export function clearInstanceVariant(
  tree: BuilderNodeTree,
  nodeId: string,
): BuilderNodeTree {
  const visit = (node: BuilderNode): BuilderNode => {
    if (
      node.id === nodeId &&
      isInstanceRootKind(node.kind) &&
      (node.props as { instanceVariant?: string }).instanceVariant !== undefined
    ) {
      const nextProps = { ...node.props } as Record<string, unknown>;
      delete nextProps.instanceVariant;
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
 * Read the active variant id on an instance node (container | card), or null.
 * Pure read — used by the editor to highlight the currently-applied variant.
 */
export function readInstanceVariant(node: BuilderNode): string | null {
  if (!isInstanceRootKind(node.kind)) return null;
  const v = (node.props as { instanceVariant?: string }).instanceVariant;
  return typeof v === "string" ? v : null;
}
