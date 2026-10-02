/**
 * THEME RELEASES: small immutable tree helpers keyed by design origin.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { indexTree } from "./classify";
import { hasKids, kidsOf, readOrigin } from "./origin";

export const ROOT_KEY = "(root)";

export function keyOf(node: BuilderNode): string | undefined {
  return readOrigin(node)?.key;
}

/** First node per key in a sibling list. */
export function keyedMap(nodes: ReadonlyArray<BuilderNode>): Map<string, BuilderNode> {
  const map = new Map<string, BuilderNode>();
  for (const n of nodes) {
    const k = keyOf(n);
    if (k && !map.has(k)) map.set(k, n);
  }
  return map;
}

/** Keys of a sibling list in order (first occurrence only). */
export function keyOrder(nodes: ReadonlyArray<BuilderNode>): string[] {
  return [...keyedMap(nodes).keys()];
}

/** True when any descendant carries no stamp (talent-added content inside). */
export function hasTalentAddedDescendant(node: BuilderNode): boolean {
  return indexTree(kidsOf(node)).added.length > 0;
}

export function sameList(a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/**
 * Reorder a sibling list by key rank, moving each keyed node together with
 * the unstamped (talent-added) nodes that follow it. Leading unstamped nodes
 * stay first; keys without a rank keep their place after the previous group.
 */
export function reorderByRank(
  nodes: ReadonlyArray<BuilderNode>,
  rank: (key: string) => number | undefined,
): BuilderNode[] {
  const lead: BuilderNode[] = [];
  const groups: Array<{ rank: number; seq: number; nodes: BuilderNode[] }> = [];
  const seen = new Set<string>();
  let prevRank = -1;
  nodes.forEach((node) => {
    const key = keyOf(node);
    if (key && !seen.has(key)) {
      seen.add(key);
      const r = rank(key);
      const value = r === undefined ? prevRank + 0.001 : r;
      prevRank = value;
      groups.push({ rank: value, seq: groups.length, nodes: [node] });
    } else if (groups.length === 0) {
      lead.push(node);
    } else {
      groups[groups.length - 1]!.nodes.push(node);
    }
  });
  groups.sort((a, b) => a.rank - b.rank || a.seq - b.seq);
  return [...lead, ...groups.flatMap((g) => g.nodes)];
}

/** Insert `node` right after the sibling keyed `anchor` (null/missing = first). */
export function insertAfter(
  nodes: ReadonlyArray<BuilderNode>,
  node: BuilderNode,
  anchor: string | null | undefined,
): BuilderNode[] {
  const out = [...nodes];
  const at = anchor ? out.findIndex((n) => keyOf(n) === anchor) : -1;
  out.splice(at + 1, 0, node);
  return out;
}

/** Index path of the first node carrying `key`. */
export function findKeyPath(tree: ReadonlyArray<BuilderNode>, key: string): number[] | null {
  return indexTree(tree).byKey.get(key)?.path ?? null;
}

/** Immutable replace (or remove, when `fn` returns null) at an index path. */
export function updateAt(
  tree: ReadonlyArray<BuilderNode>,
  path: ReadonlyArray<number>,
  fn: (node: BuilderNode) => BuilderNode | null,
): BuilderNode[] {
  const [head, ...rest] = path;
  const out: BuilderNode[] = [];
  tree.forEach((node, i) => {
    if (i !== head) {
      out.push(node);
      return;
    }
    if (rest.length === 0) {
      const next = fn(node);
      if (next) out.push(next);
      return;
    }
    out.push({ ...node, children: updateAt(kidsOf(node), rest, fn) } as BuilderNode);
  });
  return out;
}

/** Replace the sibling list under `parentKey` (null = root). Null when the parent is gone. */
export function updateList(
  tree: ReadonlyArray<BuilderNode>,
  parentKey: string | null | undefined,
  fn: (list: BuilderNode[]) => BuilderNode[],
): BuilderNode[] | null {
  if (!parentKey || parentKey === ROOT_KEY) return fn([...tree]);
  const path = findKeyPath(tree, parentKey);
  if (!path) return null;
  return updateAt(tree, path, (node) =>
    hasKids(node) ? ({ ...node, children: fn([...kidsOf(node)]) } as BuilderNode) : node,
  );
}

/** The sibling list under `parentKey` (null = root), or null when gone. */
export function listAt(
  tree: ReadonlyArray<BuilderNode>,
  parentKey: string | null | undefined,
): BuilderNode[] | null {
  if (!parentKey || parentKey === ROOT_KEY) return [...tree];
  const entry = indexTree(tree).byKey.get(parentKey);
  return entry ? kidsOf(entry.node) : null;
}
