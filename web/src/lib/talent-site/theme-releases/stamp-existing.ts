/**
 * THEME RELEASES: stamp a site applied BEFORE origin stamps existed (plan §4).
 *
 * `base` is the Design at the site's pinned version, built with the talent's
 * own content and stamped (`buildDesignTrees(..., origin)`). Each site node
 * gets the key it would have had at apply (same slotKey/segment scheme); a
 * key the base also has, with the same node kind, takes the base stamp, so
 * the base fingerprint tells the talent's edits apart. Unmatched nodes stay
 * unstamped (talent-added). With `unknownBase` (the pinned version's payload
 * is gone) every stamp gets `fp: "?"`: treated as edited, so an update only
 * ever offers new blocks. Pure.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { indexTree } from "./classify";
import { UNKNOWN_FP, hasKids, kidsOf, readOrigin, siblingKeys, withOrigin } from "./origin";

export interface StampExistingStats {
  matched: number;
  unmatched: number;
  alreadyStamped: number;
  /** Base keys with no site node (the talent removed them, or pruned at apply). */
  missing: string[];
}

export function stampFromBase(
  siteTree: ReadonlyArray<BuilderNode>,
  baseTree: ReadonlyArray<BuilderNode>,
  opts: { unknownBase?: boolean } = {},
): { tree: BuilderNode[]; stats: StampExistingStats } {
  const base = indexTree(baseTree).byKey;
  const used = new Set<string>();
  const stats: StampExistingStats = { matched: 0, unmatched: 0, alreadyStamped: 0, missing: [] };
  const visit = (nodes: ReadonlyArray<BuilderNode>, parentKey: string | null): BuilderNode[] => {
    const keys = siblingKeys(nodes, parentKey);
    return nodes.map((node, i) => {
      const own = readOrigin(node);
      let key = keys[i]!;
      let next = node;
      if (own) {
        stats.alreadyStamped += 1;
        used.add(own.key);
        key = own.key;
      } else {
        const hit = base.get(key);
        if (hit && hit.node.kind === node.kind && !used.has(key)) {
          used.add(key);
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
  stats.missing = [...base.keys()].filter((k) => !used.has(k));
  return { tree, stats };
}
