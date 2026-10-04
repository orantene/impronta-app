/**
 * THEME RELEASES (F125): critical fixes for sites with NO exact merge base.
 *
 * A noBase site (old pin, no snapshot) can never take a full merge, so a
 * critical item (accessibility, security) used to never reach it. Here a
 * critical item is applied by TARGETED key match: find the named node by
 * design key in her (stamped) tree and set only its DESIGN-OWNED props that
 * differ from the new design (content paths, her text, are never touched;
 * `detail.props` narrows it to named props). A critical item's token keys take
 * the new default. A node that cannot be found is skipped silently. Never a
 * full merge. Pure; entries are undoable through the normal reverse merge.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { indexTree } from "./classify";
import { contentPaths, designLeafValues, propsOf, setPath, stableStringify, type Props } from "./origin";
import { updateAt } from "./tree-ops";
import type { LeafChange, MergeEntry, ReleaseItem } from "./types";

export interface CriticalFix {
  trees: Record<string, BuilderNode[]>;
  tokens: Record<string, string>;
  entries: MergeEntry[];
  /** Item ids (`type:key` default) that changed something. */
  itemIds: string[];
}

export const criticalItemId = (i: ReleaseItem) => i.id ?? `${i.type}:${i.key}`;

/** Critical items not yet applied to this site (their ids are remembered on the update rows). */
export function pendingCriticalItems(items: ReadonlyArray<ReleaseItem>, doneIds: ReadonlyArray<string>): ReleaseItem[] {
  const done = new Set(doneIds);
  return items.filter((i) => i.type === "critical" && !done.has(criticalItemId(i)));
}

function nodeKeys(item: ReleaseItem): Array<{ tree: string | null; key: string }> {
  const raw = item.keys ?? (item.key && item.key !== "*" ? [item.key] : []);
  return raw.map((k) => {
    const m = /^(shell|home):(.+)$/.exec(k);
    return m ? { tree: m[1]!, key: m[2]! } : { tree: item.tree ?? null, key: k };
  });
}

const differs = (a: Map<string, unknown>, b: Map<string, unknown>, p: string) =>
  a.has(p) !== b.has(p) || stableStringify(a.get(p)) !== stableStringify(b.get(p));

const narrow = (paths: string[], want: unknown): string[] => {
  if (!Array.isArray(want) || want.length === 0) return paths;
  const names = want.filter((w): w is string => typeof w === "string");
  return paths.filter((p) => names.some((n) => p === n || p.startsWith(`${n}.`)));
};

export function planCriticalFix(input: {
  ours: { trees: Record<string, BuilderNode[]>; tokens: Record<string, string> };
  theirs: { trees: Record<string, BuilderNode[]>; tokens: Record<string, string> };
  items: ReadonlyArray<ReleaseItem>;
}): CriticalFix | null {
  const trees: Record<string, BuilderNode[]> = { ...input.ours.trees };
  const tokens = { ...input.ours.tokens };
  const entries: MergeEntry[] = [];
  const itemIds: string[] = [];
  let seq = 0;

  for (const item of input.items.filter((i) => i.type === "critical")) {
    const before = entries.length;
    for (const { tree: only, key } of nodeKeys(item)) {
      for (const tree of only ? [only] : Object.keys(trees)) {
        const oursNode = indexTree(trees[tree] ?? []).byKey.get(key);
        const theirsNode = indexTree(input.theirs.trees[tree] ?? []).byKey.get(key);
        if (!oursNode || !theirsNode) continue;
        const cp = [...new Set([...contentPaths(propsOf(oursNode.node)), ...contentPaths(propsOf(theirsNode.node))])];
        const O = designLeafValues(propsOf(oursNode.node), cp);
        const T = designLeafValues(propsOf(theirsNode.node), cp);
        const paths = narrow(
          [...new Set([...O.keys(), ...T.keys()])].filter((p) => differs(O, T, p)).sort(),
          item.detail?.props,
        );
        if (paths.length === 0) continue;
        let props: Props = propsOf(oursNode.node);
        for (const p of paths) props = setPath(props, p, T.has(p), T.get(p));
        const changes: LeafChange[] = paths.map((path) => ({
          path,
          hadBefore: O.has(path),
          ...(O.has(path) ? { before: O.get(path) } : {}),
          hasAfter: T.has(path),
          ...(T.has(path) ? { after: T.get(path) } : {}),
        }));
        trees[tree] = updateAt(trees[tree]!, oursNode.path, (n) => ({ ...n, props }) as BuilderNode);
        entries.push({ seq: (seq += 1), change: "props", tree, key, changes, reason: "critical", itemId: criticalItemId(item) });
      }
    }
    for (const tk of item.tokenKeys ?? []) {
      const next = input.theirs.tokens[tk];
      if (typeof next !== "string" || tokens[tk] === next) continue;
      const had = tk in tokens;
      entries.push({
        seq: (seq += 1),
        change: "token",
        key: tk,
        changes: [{ path: tk, hadBefore: had, ...(had ? { before: tokens[tk] } : {}), hasAfter: true, after: next }],
        reason: "critical",
        itemId: criticalItemId(item),
      });
      tokens[tk] = next;
    }
    if (entries.length > before) itemIds.push(criticalItemId(item));
  }
  return entries.length > 0 ? { trees, tokens, entries, itemIds } : null;
}
