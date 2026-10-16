/**
 * THEME RELEASES: the three-way merge (plan §1.4). Pure.
 *
 * base = the Design at the site's pinned version, ours = the site draft,
 * theirs = the Design at the target version (all three built with the
 * talent's own content, so a new block arrives already filled). Nodes are
 * matched by design key (`props.__origin.key`), never by id or position.
 *
 * Per key:
 *   untouched in ours           take theirs' design-owned props (applied)
 *   edited in ours              keep ours (kept); props both sides changed
 *                               are listed as conflicts
 *   removed in ours             stays removed (kept, reason removed), unless
 *                               a critical item names the key (restore)
 *   removed in theirs           dropped when untouched (removed), else kept
 *   new in theirs               inserted after its design neighbour (added)
 *                               when an item allows it, else pending
 *   layout key swap             (old key removed + new key in its slot) ONE
 *                               choice: untouched swaps cleanly; edited
 *                               carries her edits to the new node (applied,
 *                               moved_edits) or, when they cannot map, keeps
 *                               hers and skips the swap (conflict); removed
 *                               by her stays removed unless critical. Never
 *                               both nodes.
 *   sibling order changed       applied when ours still has the base order
 *                               (talent-added nodes travel with the node
 *                               before them), else kept (your_order)
 * Content-owned props (`cp`) and talent-added nodes are never touched.
 * Default COPY (base text + `i18n` translations) follows the per-leaf rule in
 * copy-merge.ts: a leaf she did not change takes the new default, one she did
 * stays hers (and an `i18n` one is reported as a copy conflict).
 * Running the merge again on its own output changes nothing.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import {
  designLeafValues,
  getPath,
  hasKids,
  isNodeEdited,
  kidsOf,
  propsOf,
  readOrigin,
  setPath,
  stableStringify,
  withOrigin,
  DESIGN_ORIGIN_PROP,
  type Props,
} from "./origin";
import { copyOwnedBasePaths, copyPathsAmong, mergeCopy } from "./copy-merge";
import { makeAllow, type Allowance, type AllowFn } from "./policy";
import { carryEdits, detectSwaps, type SwapPair } from "./swap";
import { mergePaletteTokens, mergeTokenDefaults } from "./tokens-merge";
import {
  ROOT_KEY,
  hasTalentAddedDescendant,
  insertAfter,
  keyOf,
  keyOrder,
  keyedMap,
  reorderByRank,
  sameList,
} from "./tree-ops";
import { collectNodeIds, freshenNodeIds } from "@/lib/site-admin/builder-node/unique-ids";
import {
  emptyReport,
  type LeafChange,
  type MergeEntry,
  type MergeInput,
  type DesignMergeReport,
  type MergeResult,
} from "./types";

interface Ctx {
  tree: string;
  allow: AllowFn;
  report: DesignMergeReport;
  seq: () => number;
  /** Swap pairs declared by release items (per tree), on top of detected ones. */
  swaps: ReadonlyArray<SwapPair>;
  /** Ids already in this tree. Inserted nodes are remapped against it (F131). */
  usedIds: Set<string>;
}

export const MOVED_EDITS_NOTE = "moved your edits to the new layout";
export const SWAP_KEPT_NOTE = "kept your version, the new layout was not applied";

function entry(
  ctx: Ctx,
  fields: Omit<MergeEntry, "seq" | "tree">,
  item?: { itemId?: string; itemType?: MergeEntry["itemType"] },
): MergeEntry {
  const prop = fields.changes?.map((c) => c.path).join(",");
  return {
    seq: ctx.seq(),
    tree: ctx.tree,
    ...fields,
    ...(prop ? { prop } : {}),
    ...(item?.itemId ? { itemId: item.itemId } : {}),
    ...(item?.itemType ? { itemType: item.itemType } : {}),
  };
}

function unionCp(...nodes: BuilderNode[]): string[] {
  const out = new Set<string>();
  for (const n of nodes) for (const p of readOrigin(n)?.cp ?? []) out.add(p);
  return [...out];
}

/** Design-owned leaf paths where `a` and `b` differ. */
function changedPaths(a: Map<string, unknown>, b: Map<string, unknown>): string[] {
  const paths = new Set([...a.keys(), ...b.keys()]);
  return [...paths]
    .filter((p) => a.has(p) !== b.has(p) || stableStringify(a.get(p)) !== stableStringify(b.get(p)))
    .sort();
}

function sameLeaf(m: Map<string, unknown>, n: Map<string, unknown>, p: string): boolean {
  return m.has(p) === n.has(p) && stableStringify(m.get(p)) === stableStringify(n.get(p));
}

function leafChanges(paths: string[], from: Map<string, unknown>, to: Map<string, unknown>): LeafChange[] {
  return paths.map((path) => ({
    path,
    hadBefore: from.has(path),
    ...(from.has(path) ? { before: from.get(path) } : {}),
    hasAfter: to.has(path),
    ...(to.has(path) ? { after: to.get(path) } : {}),
  }));
}

function designDiffers(b: BuilderNode, t: BuilderNode): boolean {
  if (b.kind !== t.kind) return true;
  const cp = unionCp(b, t);
  return changedPaths(designLeafValues(propsOf(b), cp), designLeafValues(propsOf(t), cp)).length > 0;
}

/** The design changed this node or anything below it. */
function subtreeDiffers(b: BuilderNode, t: BuilderNode): boolean {
  if (designDiffers(b, t)) return true;
  const bk = keyedMap(kidsOf(b));
  const tk = keyedMap(kidsOf(t));
  if (!sameList([...bk.keys()], [...tk.keys()])) return true;
  for (const [k, child] of bk) if (subtreeDiffers(child, tk.get(k)!)) return true;
  return false;
}

/** The design rule, then the per-leaf copy rule (copy-merge.ts) on its result. */
function mergeNode(ctx: Ctx, key: string, b: BuilderNode, o: BuilderNode, t: BuilderNode): BuilderNode {
  const merged = mergeNodeDesign(ctx, key, b, o, t);
  return mergeCopy(ctx, key, b, o, t, merged);
}

function mergeNodeDesign(ctx: Ctx, key: string, b: BuilderNode, o: BuilderNode, t: BuilderNode): BuilderNode {
  const kids = hasKids(o) ? mergeList(ctx, key, kidsOf(b), kidsOf(o), kidsOf(t)) : null;
  const node = kids ? ({ ...o, children: kids } as BuilderNode) : o;
  const tOrigin = readOrigin(t);
  const allowance = ctx.allow("node", key, ctx.tree);
  const edited = isNodeEdited(o);

  if (o.kind !== t.kind || b.kind !== t.kind) {
    if (!allowance.ok) {
      ctx.report.pending.push(entry(ctx, { change: "kind", key, reason: "not_in_release" }));
      return node;
    }
    if ((edited || o.kind !== b.kind) && !allowance.critical) {
      ctx.report.kept.push(entry(ctx, { change: "kind", key, reason: "edited" }, allowance));
      return node;
    }
    ctx.report.applied.push(
      entry(ctx, { change: "kind", key, beforeNode: o, node: t }, allowance),
    );
    return t;
  }

  const cp = unionCp(b, o, t);
  const B = designLeafValues(propsOf(b), cp);
  const O = designLeafValues(propsOf(o), cp);
  const T = designLeafValues(propsOf(t), cp);
  const changed = changedPaths(B, T);
  if (changed.length === 0) {
    // Nothing moved in the design: carry the node to the new version quietly.
    const originBefore = readOrigin(o);
    if (!tOrigin || edited || !originBefore || stableStringify(originBefore) === stableStringify(tOrigin)) {
      return node;
    }
    ctx.report.restamped.push(entry(ctx, { change: "restamp", key, originBefore, originAfter: tOrigin }));
    return withOrigin(node, tOrigin);
  }
  if (!allowance.ok) {
    ctx.report.pending.push(
      entry(ctx, { change: "props", key, changes: leafChanges(changed, O, T), reason: "not_in_release" }),
    );
    return node;
  }
  if (edited && !allowance.critical) {
    // Base text the copy rule writes on its own is not a kept edit.
    const owned = copyOwnedBasePaths(b, o, t, ctx.allow, ctx.tree, key);
    const keptPaths = changed.filter((p) => !owned.has(p));
    if (keptPaths.length === 0) return node;
    ctx.report.kept.push(
      entry(ctx, { change: "props", key, changes: leafChanges(keptPaths, O, T), reason: "edited" }, allowance),
    );
    const overlap = keptPaths.filter((p) => !sameLeaf(O, B, p) && !sameLeaf(O, T, p));
    if (overlap.length > 0) {
      ctx.report.conflicts.push(
        entry(ctx, { change: "props", key, changes: leafChanges(overlap, O, T), reason: "edited" }, allowance),
      );
    }
    return node;
  }

  const writes = changed.filter((p) => !sameLeaf(O, T, p));
  let props: Props = propsOf(node);
  for (const p of writes) props = setPath(props, p, T.has(p), T.get(p));
  const originBefore = readOrigin(o);
  if (tOrigin) props = { ...props, [DESIGN_ORIGIN_PROP]: tOrigin };
  if (writes.length > 0) {
    const copyPaths = copyPathsAmong(b, t, cp, writes);
    ctx.report.applied.push(
      entry(
        ctx,
        {
          change: "props",
          key,
          changes: leafChanges(writes, O, T),
          ...(copyPaths.length > 0 ? { copyPaths } : {}),
          ...(originBefore ? { originBefore } : {}),
          ...(edited ? { reason: "critical" as const } : {}),
        },
        allowance,
      ),
    );
  }
  return { ...node, props } as BuilderNode;
}

function lastKey(list: ReadonlyArray<BuilderNode>): string | null {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const k = keyOf(list[i]!);
    if (k) return k;
  }
  return null;
}

/** The nearest design sibling before `key` in theirs that ours still has. */
function anchorFor(tKids: ReadonlyArray<BuilderNode>, key: string, out: ReadonlyArray<BuilderNode>): string | null {
  const present = new Set(keyOrder(out));
  const order = keyOrder(tKids);
  for (let i = order.indexOf(key) - 1; i >= 0; i -= 1) if (present.has(order[i]!)) return order[i]!;
  return null;
}

function swapAllowance(ctx: Ctx, pair: SwapPair): Allowance {
  const r = ctx.allow("remove", pair.from, ctx.tree);
  const n = ctx.allow("new", pair.to, ctx.tree);
  const critical = r.critical || n.critical;
  const pick = n.ok ? n : r;
  return {
    ok: (r.ok && n.ok) || critical,
    critical,
    explicitCritical: r.explicitCritical || n.explicitCritical,
    ...(pick.itemId ? { itemId: pick.itemId } : {}),
    ...(pick.itemType ? { itemType: pick.itemType } : {}),
  };
}

/** Swap pairs for one sibling list: detected from the design plus declared by items. */
function swapPairsFor(
  ctx: Ctx,
  bMap: Map<string, BuilderNode>,
  tMap: Map<string, BuilderNode>,
  oKids: ReadonlyArray<BuilderNode>,
  bKids: ReadonlyArray<BuilderNode>,
  tKids: ReadonlyArray<BuilderNode>,
): Map<string, SwapPair> {
  const oMap = keyedMap(oKids);
  const out = new Map<string, SwapPair>();
  const taken = new Set<string>();
  for (const pair of [...ctx.swaps, ...detectSwaps(bKids, tKids)]) {
    if (out.has(pair.from) || taken.has(pair.to)) continue;
    if (!bMap.has(pair.from) || tMap.has(pair.from) || !tMap.has(pair.to)) continue;
    // `ensure` pairs name a `to` the base already had (an optional block shipped earlier).
    if (bMap.has(pair.to) && !pair.ensure) continue;
    // Already on the new layout (a re-run), or an `ensure` pair whose `to` she already
    // has: nothing to insert, so `from` goes through the ordinary removal path.
    if (oMap.has(pair.to)) continue;
    out.set(pair.from, pair);
    taken.add(pair.to);
  }
  return out;
}

/** One atomic swap of the old node `o` for the new node `t`. Returns the node to keep. */
function mergeSwap(
  ctx: Ctx,
  parentKey: string | null,
  pair: SwapPair,
  b: BuilderNode,
  o: BuilderNode,
  t: BuilderNode,
  anchor: string | null,
): BuilderNode {
  const allowance = swapAllowance(ctx, pair);
  const base = { key: pair.to, fromKey: pair.from, parentKey };
  if (!allowance.ok) {
    ctx.report.pending.push(entry(ctx, { change: "swap", ...base, anchor, node: t, reason: "not_in_release" }));
    return o;
  }
  const carried = carryEdits(b, o, t);
  if (carried.unmappable.length > 0 && !allowance.critical) {
    const O = designLeafValues(propsOf(o), unionCp(b, o));
    const T = designLeafValues(propsOf(t), unionCp(t));
    const changes = leafChanges(carried.unmappable, O, T);
    const kept = { change: "swap" as const, ...base, key: pair.from, changes, reason: "edited" as const, note: SWAP_KEPT_NOTE };
    ctx.report.kept.push(entry(ctx, kept, allowance));
    ctx.report.conflicts.push(entry(ctx, kept, allowance));
    return o;
  }
  const edited = carried.moved.length > 0 || carried.unmappable.length > 0;
  ctx.report.applied.push(
    entry(
      ctx,
      {
        change: "swap",
        ...base,
        anchor,
        beforeNode: o,
        node: carried.node,
        ...(carried.unmappable.length > 0
          ? { reason: "critical" as const }
          : edited
            ? { reason: "moved_edits" as const, note: MOVED_EDITS_NOTE }
            : {}),
      },
      allowance,
    ),
  );
  return freshenNodeIds(carried.node, ctx.usedIds);
}

function mergeList(
  ctx: Ctx,
  parentKey: string | null,
  bKids: ReadonlyArray<BuilderNode>,
  oKids: ReadonlyArray<BuilderNode>,
  tKids: ReadonlyArray<BuilderNode>,
): BuilderNode[] {
  const bMap = keyedMap(bKids);
  const tMap = keyedMap(tKids);
  const seen = new Set<string>();
  let out: BuilderNode[] = [];
  const swaps = swapPairsFor(ctx, bMap, tMap, oKids, bKids, tKids);

  for (const o of oKids) {
    const key = keyOf(o);
    if (!key || seen.has(key)) {
      out.push(o);
      continue;
    }
    seen.add(key);
    const b = bMap.get(key);
    const t = tMap.get(key);
    if (!b) {
      if (t && designDiffers(o, t)) ctx.report.kept.push(entry(ctx, { change: "props", key, reason: "no_base" }));
      out.push(o);
      continue;
    }
    const pair = !t ? swaps.get(key) : undefined;
    if (pair) {
      seen.add(pair.to);
      out.push(mergeSwap(ctx, parentKey, pair, b, o, tMap.get(pair.to)!, lastKey(out)));
      continue;
    }
    if (!t) {
      const allowance = ctx.allow("remove", key, ctx.tree);
      const edited = isNodeEdited(o) || hasTalentAddedDescendant(o);
      if (allowance.ok && (!edited || allowance.critical)) {
        ctx.report.removed.push(
          entry(ctx, { change: "remove", key, parentKey, anchor: lastKey(out), node: o }, allowance),
        );
        continue;
      }
      ctx.report[allowance.ok ? "kept" : "pending"].push(
        entry(ctx, { change: "remove", key, parentKey, reason: allowance.ok ? "edited" : "not_in_release" }),
      );
      out.push(o);
      continue;
    }
    out.push(mergeNode(ctx, key, b, o, t));
  }

  // Keys the talent removed stay removed (a critical item naming one restores it).
  for (const [key, t] of tMap) {
    const b = bMap.get(key);
    if (seen.has(key) || !b) continue;
    const allowance = ctx.allow("node", key, ctx.tree);
    if (allowance.explicitCritical) {
      const anchor = anchorFor(tKids, key, out);
      out = insertAfter(out, freshenNodeIds(t, ctx.usedIds), anchor);
      seen.add(key);
      ctx.report.applied.push(
        entry(ctx, { change: "restore", key, parentKey, anchor, node: t, reason: "critical" }, allowance),
      );
    } else if (subtreeDiffers(b, t)) {
      ctx.report.kept.push(entry(ctx, { change: "props", key, reason: "removed" }));
    }
  }

  // Swaps whose old node she removed: the new layout stays out unless critical.
  for (const pair of swaps.values()) {
    if (seen.has(pair.from)) continue;
    seen.add(pair.to);
    const allowance = swapAllowance(ctx, pair);
    const t = tMap.get(pair.to)!;
    const anchor = anchorFor(tKids, pair.to, out);
    if (allowance.ok && allowance.explicitCritical) {
      out = insertAfter(out, freshenNodeIds(t, ctx.usedIds), anchor);
      ctx.report.applied.push(
        entry(ctx, { change: "insert", key: pair.to, fromKey: pair.from, parentKey, anchor, node: t, reason: "critical" }, allowance),
      );
    } else {
      ctx.report[allowance.ok ? "kept" : "pending"].push(
        entry(ctx, {
          change: "swap",
          key: pair.to,
          fromKey: pair.from,
          parentKey,
          anchor,
          node: t,
          reason: allowance.ok ? "removed" : "not_in_release",
        }),
      );
    }
  }

  // Keys new in theirs.
  for (const t of tKids) {
    const key = keyOf(t);
    if (!key || bMap.has(key) || seen.has(key)) continue;
    seen.add(key);
    const allowance = ctx.allow("new", key, ctx.tree);
    const anchor = anchorFor(tKids, key, out);
    if (!allowance.ok) {
      ctx.report.pending.push(
        entry(ctx, { change: "insert", key, parentKey, anchor, node: t, reason: "not_in_release" }),
      );
      continue;
    }
    out = insertAfter(out, freshenNodeIds(t, ctx.usedIds), anchor);
    ctx.report.added.push(entry(ctx, { change: "insert", key, parentKey, anchor, node: t }, allowance));
  }

  return reorder(ctx, parentKey, bKids, out, tKids, new Set(keyOrder(oKids)));
}

function reorder(
  ctx: Ctx,
  parentKey: string | null,
  bKids: ReadonlyArray<BuilderNode>,
  out: BuilderNode[],
  tKids: ReadonlyArray<BuilderNode>,
  oursKeys: ReadonlySet<string>,
): BuilderNode[] {
  const bOrder = keyOrder(bKids);
  const tOrder = keyOrder(tKids);
  const current = keyOrder(out);
  const common = new Set(current.filter((k) => bOrder.includes(k) && tOrder.includes(k)));
  const baseRel = bOrder.filter((k) => common.has(k));
  const theirsRel = tOrder.filter((k) => common.has(k));
  if (sameList(baseRel, theirsRel)) return out;
  const scope = parentKey ?? ROOT_KEY;
  const allowance = ctx.allow("order", scope, ctx.tree);
  if (!allowance.ok) {
    ctx.report.pending.push(entry(ctx, { change: "order", key: scope, parentKey, reason: "not_in_release" }));
    return out;
  }
  const oursRel = current.filter((k) => common.has(k));
  if (!sameList(oursRel, baseRel) && !allowance.critical) {
    ctx.report.kept.push(entry(ctx, { change: "order", key: scope, parentKey, reason: "your_order" }));
    return out;
  }
  const rank = new Map(tOrder.map((k, i) => [k, i] as const));
  // F130: a block she ADDED earlier (in her page, in the new design, but not in her
  // base) is anchored to the section it follows: it has no design rank of its own, so it
  // moves with that section instead of jumping to its design position.
  const next = reorderByRank(out, (k) => (oursKeys.has(k) && !bOrder.includes(k) ? undefined : rank.get(k)));
  const afterOrder = keyOrder(next);
  if (sameList(afterOrder, current)) return out;
  ctx.report.applied.push(
    entry(ctx, { change: "order", key: scope, parentKey, beforeOrder: current, afterOrder }, allowance),
  );
  return next;
}

/** Three-way merge of a Design update into a site draft (plan §1.4). */
export function mergeDesignUpdate(input: MergeInput): MergeResult {
  const report = emptyReport();
  let n = 0;
  const seq = () => (n += 1);
  const itemAllow = makeAllow(input.items);
  const allow: AllowFn = input.forceDesign
    ? (scope, key, tree) => {
        const a = itemAllow(scope, key, tree);
        return a.ok ? { ...a, critical: true } : a;
      }
    : itemAllow;
  const declared = (input.items ?? []).flatMap((i) => (i.swap ? [{ tree: i.tree, pair: i.swap }] : []));
  const trees: Record<string, BuilderNode[]> = {};
  for (const [name, ours] of Object.entries(input.ours.trees)) {
    const theirs = input.theirs.trees[name];
    if (!theirs) {
      trees[name] = ours;
      continue;
    }
    const swaps = declared.filter((d) => !d.tree || d.tree === name).map((d) => d.pair);
    trees[name] = mergeList({ tree: name, allow, report, seq, swaps, usedIds: new Set(collectNodeIds(ours)) }, null, input.base.trees[name] ?? [], ours, theirs);
  }
  const tokens = mergeTokenDefaults({
    base: input.base.tokens ?? {},
    ours: input.ours.tokens ?? {},
    theirs: input.theirs.tokens ?? {},
    ...(input.tokenOrigin ? { origin: input.tokenOrigin } : {}),
    allow,
    report,
    nextSeq: seq,
  });
  const withPalette = input.palette
    ? mergePaletteTokens({ ...input.palette, tokens, allow, report, nextSeq: seq })
    : tokens;
  return { trees, tokens: withPalette, report };
}

/** Read helper for reports: a leaf of the node's props. */
export function leafValue(node: BuilderNode, path: string): unknown {
  return getPath(propsOf(node), path).value;
}
