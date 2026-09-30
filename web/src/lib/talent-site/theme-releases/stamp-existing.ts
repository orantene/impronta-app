/**
 * THEME RELEASES: stamp a site applied BEFORE origin stamps existed (plan §4).
 *
 * `base` is the Design at the site's pinned version, built with the talent's
 * own content and stamped (`buildDesignTrees(..., origin)`). Each site node
 * is matched to a base sibling under the same parent by segment + kind +
 * layer label (so a restyled demo that reorders same-kind siblings still
 * matches), then by ordinal key; the matched base stamp is copied, so
 * the base fingerprint tells the talent's edits apart. Unmatched nodes stay
 * unstamped (talent-added). With `unknownBase` (the pinned version's payload
 * is gone) every stamp gets `fp: "?"`: treated as edited, so an update only
 * ever offers new blocks. Pure.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { indexTree, type IndexedNode } from "./classify";
import { UNKNOWN_FP, hasKids, kidsOf, nodeSegment, propsOf, readOrigin, siblingKeys, withOrigin } from "./origin";

export interface StampExistingStats {
  matched: number;
  unmatched: number;
  alreadyStamped: number;
  /** Base keys with no site node (the talent removed them, or pruned at apply). */
  missing: string[];
}

/** Identity hints a styled copy keeps even when it reorders siblings. */
function signature(node: BuilderNode): string {
  const p = propsOf(node);
  const label = typeof p.layerLabel === "string" ? p.layerLabel : "";
  return `${nodeSegment(node)}|${node.kind}|${label}`;
}

/**
 * Pick the base sibling for a site node: same segment, kind and layer label
 * first (a reordered or restyled copy keeps these), preferring the one whose
 * ordinal key also matches; then the ordinal key alone (same kind). Never an
 * already-used base node.
 */
function pickBase(
  node: BuilderNode,
  ordinalKey: string,
  pool: ReadonlyArray<IndexedNode>,
  used: ReadonlySet<string>,
): IndexedNode | undefined {
  const free = pool.filter((b) => !used.has(b.key) && b.node.kind === node.kind);
  const sig = signature(node);
  const bySig = free.filter((b) => signature(b.node) === sig);
  return (
    bySig.find((b) => b.key === ordinalKey) ??
    bySig[0] ??
    free.find((b) => b.key === ordinalKey)
  );
}

export function stampFromBase(
  siteTree: ReadonlyArray<BuilderNode>,
  baseTree: ReadonlyArray<BuilderNode>,
  opts: { unknownBase?: boolean } = {},
): { tree: BuilderNode[]; stats: StampExistingStats } {
  const index = indexTree(baseTree).byKey;
  const childrenOf = new Map<string | null, IndexedNode[]>();
  for (const entry of index.values()) {
    const list = childrenOf.get(entry.parentKey) ?? [];
    list.push(entry);
    childrenOf.set(entry.parentKey, list);
  }
  const used = new Set<string>();
  const stats: StampExistingStats = { matched: 0, unmatched: 0, alreadyStamped: 0, missing: [] };
  const visit = (nodes: ReadonlyArray<BuilderNode>, parentKey: string | null): BuilderNode[] => {
    const keys = siblingKeys(nodes, parentKey);
    const pool = childrenOf.get(parentKey) ?? [];
    return nodes.map((node, i) => {
      const own = readOrigin(node);
      let key = keys[i]!;
      let next = node;
      if (own) {
        stats.alreadyStamped += 1;
        used.add(own.key);
        key = own.key;
      } else {
        const hit = pickBase(node, key, pool, used);
        if (hit) {
          used.add(hit.key);
          key = hit.key;
          stats.matched += 1;
          next = withOrigin(node, opts.unknownBase ? { ...hit.origin, fp: UNKNOWN_FP } : hit.origin);
        } else {
          stats.unmatched += 1;
        }
      }
      return hasKids(node) ? ({ ...next, children: visit(kidsOf(node), key) } as BuilderNode) : next;
    });
  };
  const tree = visit(siteTree, null);
  stats.missing = [...index.keys()].filter((k) => !used.has(k));
  return { tree, stats };
}
