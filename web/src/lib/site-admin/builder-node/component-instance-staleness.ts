import type { BuilderNode, BuilderNodeTree } from "./types";

/**
 * Linked-component STALENESS detection (pure).
 *
 * Ground truth this module encodes (verified 2026-08-15):
 *   - PUBLISHED and PREVIEW pages resolve a linked instance's children LIVE
 *     from the master (`resolveInstanceChildren` via the per-render component
 *     loader), so a master edit shows up on every published page without a
 *     republish or a per-page sync.
 *   - The EDITOR canvas deliberately does NOT resolve live (namespaced ids
 *     would break the selection model), so it renders the instance's STORED
 *     children — a per-page snapshot minted by `cloneNodeWithFreshIds` at
 *     insert/sync time. That snapshot also serves as the published fallback
 *     when the master is archived or fails to load.
 *
 * So a page's stored copy can drift behind the master. This module answers
 * "has it drifted?" without false positives from the one thing that ALWAYS
 * differs between a stored copy and its master: node ids (fresh-minted on
 * every clone).
 *
 * Comparison model — canonicalize both sides the same way, then deep-compare:
 *   - every node id is replaced with its depth-first ordinal, so two clones of
 *     the same master canonicalize identically;
 *   - id-REFERENCING props are rewritten through the same ordinal map,
 *     mirroring `cloneNodeWithFreshIds` exactly (accordion `defaultOpenItemIds`
 *     keeps only mapped ids and disappears when empty; tabs `defaultTabId`
 *     disappears when unmapped) — so a master that carries a dangling external
 *     ref canonicalizes to the same shape as its clone, and "Sync" actually
 *     clears the stale flag instead of chasing an unreachable fixpoint;
 *   - object keys are serialized sorted, so prop insertion order is ignored.
 *
 * `instanceOverrides` on the instance ROOT never enter the comparison: the
 * comparison is over the children arrays only, which is also why a sync can
 * never disturb an operator's per-instance overrides (they live in the root's
 * props map, keyed by MASTER child ids).
 */

/** Depth-first ordinal ids for every node in a children array. */
function buildOrdinalIdMap(
  nodes: ReadonlyArray<BuilderNode>,
): Map<string, string> {
  const map = new Map<string, string>();
  let counter = 0;
  const visit = (node: BuilderNode): void => {
    map.set(node.id, `#${counter}`);
    counter += 1;
    if ("children" in node && Array.isArray(node.children)) {
      node.children.forEach(visit);
    }
  };
  nodes.forEach(visit);
  return map;
}

/**
 * Rebuild one node with canonical ids, id-refs remapped, children normalized.
 * Mirrors the id-ref semantics of `cloneNodeWithFreshIds` (see module doc).
 */
function normalizeNode(
  node: BuilderNode,
  idMap: Map<string, string>,
): Record<string, unknown> {
  const props = { ...(node.props as Record<string, unknown>) };

  if (node.kind === "accordion" && Array.isArray(props.defaultOpenItemIds)) {
    const mapped = (props.defaultOpenItemIds as string[])
      .map((id) => idMap.get(id))
      .filter((id): id is string => Boolean(id));
    if (mapped.length > 0) {
      props.defaultOpenItemIds = mapped;
    } else {
      delete props.defaultOpenItemIds;
    }
  }
  if (node.kind === "tabs" && typeof props.defaultTabId === "string") {
    const mapped = idMap.get(props.defaultTabId);
    if (mapped) {
      props.defaultTabId = mapped;
    } else {
      delete props.defaultTabId;
    }
  }

  const out: Record<string, unknown> = {
    id: idMap.get(node.id) ?? node.id,
    kind: node.kind,
    props,
  };
  if ("children" in node && Array.isArray(node.children)) {
    out.children = node.children.map((child) => normalizeNode(child, idMap));
  }
  return out;
}

/** JSON.stringify with recursively sorted object keys (arrays keep order). */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((k) => record[k] !== undefined)
      .sort();
    return `{${keys
      .map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** Canonical fingerprint of a children array, id-insensitive. */
export function canonicalChildrenFingerprint(
  children: ReadonlyArray<BuilderNode>,
): string {
  const idMap = buildOrdinalIdMap(children);
  return stableStringify(children.map((node) => normalizeNode(node, idMap)));
}

/**
 * Does an instance's STORED children array still match the master's children,
 * up to node-id renaming? True = in sync; false = the page's editor copy is
 * out of date (a "Sync" would change it).
 */
export function instanceChildrenMatchMaster(
  instanceChildren: ReadonlyArray<BuilderNode>,
  masterChildren: ReadonlyArray<BuilderNode>,
): boolean {
  return (
    canonicalChildrenFingerprint(instanceChildren) ===
    canonicalChildrenFingerprint(masterChildren)
  );
}

export interface ComponentInstanceStaleness {
  /** Linked instances of the component on this page. */
  instances: number;
  /** How many of them have stored children that no longer match the master. */
  stale: number;
}

function readInstanceOf(node: BuilderNode): string | undefined {
  if (node.kind !== "container" && node.kind !== "card") return undefined;
  const props = node.props as { instanceOf?: string };
  return typeof props.instanceOf === "string" ? props.instanceOf : undefined;
}

/**
 * Count the linked instances of `componentId` in the tree and how many of them
 * are STALE relative to `masterChildren`. Traversal mirrors
 * `countComponentInstances` (instances' own subtrees are not recursed into).
 * Pure read.
 */
export function countStaleComponentInstances(
  tree: BuilderNodeTree,
  componentId: string,
  masterChildren: ReadonlyArray<BuilderNode>,
): ComponentInstanceStaleness {
  // Fingerprint the master ONCE — pages with many instances of one component
  // (the exact case staleness matters for) should not re-canonicalize it per
  // instance.
  const masterFingerprint = canonicalChildrenFingerprint(masterChildren);
  let instances = 0;
  let stale = 0;
  const visit = (node: BuilderNode): void => {
    if (readInstanceOf(node) === componentId) {
      instances += 1;
      const children =
        "children" in node && Array.isArray(node.children) ? node.children : [];
      if (canonicalChildrenFingerprint(children) !== masterFingerprint) {
        stale += 1;
      }
      return; // don't recurse into an instance's own subtree
    }
    if ("children" in node && Array.isArray(node.children)) {
      node.children.forEach(visit);
    }
  };
  tree.forEach(visit);
  return { instances, stale };
}
