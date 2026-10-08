/**
 * THEME RELEASES: classify a site tree against its design stamps (plan §1.2).
 *
 * Per design key: `untouched` (design-owned props still hash to the stamp),
 * `edited` (they do not), `removed` (an expected key is missing from the
 * tree). A node with no `__origin`, or a second node carrying a key already
 * seen (a duplicated block copies its stamp), is talent-added. Pure.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { isNodeEdited, kidsOf, readOrigin, type DesignOrigin } from "./origin";

export type OriginState = "untouched" | "edited" | "removed";

export interface IndexedNode {
  key: string;
  node: BuilderNode;
  origin: DesignOrigin;
  /** Index path from the tree root. */
  path: number[];
  /** Key of the nearest stamped ancestor (null at the root). */
  parentKey: string | null;
}

export interface TreeIndex {
  byKey: Map<string, IndexedNode>;
  added: Array<{ node: BuilderNode; path: number[] }>;
}

/** First occurrence of every design key; later duplicates count as talent-added. */
export function indexTree(tree: ReadonlyArray<BuilderNode>): TreeIndex {
  const byKey = new Map<string, IndexedNode>();
  const added: TreeIndex["added"] = [];
  const walk = (nodes: ReadonlyArray<BuilderNode>, trail: number[], parentKey: string | null) => {
    nodes.forEach((node, i) => {
      const path = [...trail, i];
      const origin = readOrigin(node);
      let nextParent = parentKey;
      if (origin && !byKey.has(origin.key)) {
        byKey.set(origin.key, { key: origin.key, node, origin, path, parentKey });
        nextParent = origin.key;
      } else {
        added.push({ node, path });
      }
      walk(kidsOf(node), path, nextParent);
    });
  };
  walk(tree, [], null);
  return { byKey, added };
}

export interface TreeClassification {
  states: Map<string, OriginState>;
  added: Array<{ node: BuilderNode; path: number[] }>;
  counts: { untouched: number; edited: number; removed: number; added: number };
}

/**
 * Classify every stamped node. Pass `expectedKeys` (the base design's keys)
 * to also report the ones the talent removed.
 */
export function classifyTree(
  tree: ReadonlyArray<BuilderNode>,
  expectedKeys?: Iterable<string>,
): TreeClassification {
  const index = indexTree(tree);
  const states = new Map<string, OriginState>();
  for (const [key, entry] of index.byKey) {
    states.set(key, isNodeEdited(entry.node) ? "edited" : "untouched");
  }
  for (const key of expectedKeys ?? []) if (!states.has(key)) states.set(key, "removed");
  const counts = { untouched: 0, edited: 0, removed: 0, added: index.added.length };
  for (const s of states.values()) counts[s] += 1;
  return { states, added: index.added, counts };
}

/** All design keys of a (stamped) tree, in document order. */
export function designKeys(tree: ReadonlyArray<BuilderNode>): string[] {
  return [...indexTree(tree).byKey.keys()];
}
