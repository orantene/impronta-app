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
 *   sibling order changed       applied when ours still has the base order
 *                               (talent-added nodes travel with the node
 *                               before them), else kept (your_order)
 * Content-owned props (`cp`, `i18n`) and talent-added nodes are never
 * touched. Running the merge again on its own output changes nothing.
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
import { makeAllow, type AllowFn } from "./policy";
import { mergeTokenDefaults } from "./tokens-merge";
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
}

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

function mergeNode(ctx: Ctx, key: string, b: BuilderNode, o: BuilderNode, t: BuilderNode): BuilderNode {
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
    ctx.report.kept.push(
      entry(ctx, { change: "props", key, changes: leafChanges(changed, O, T), reason: "edited" }, allowance),
    );
    const overlap = changed.filter((p) => !sameLeaf(O, B, p) && !sameLeaf(O, T, p));
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
    ctx.report.applied.push(
      entry(
        ctx,
        {
          change: "props",
          key,
          changes: leafChanges(writes, O, T),
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
      out = insertAfter(out, t, anchor);
      seen.add(key);
      ctx.report.applied.push(
        entry(ctx, { change: "restore", key, parentKey, anchor, node: t, reason: "critical" }, allowance),
      );
    } else if (subtreeDiffers(b, t)) {
      ctx.report.kept.push(entry(ctx, { change: "props", key, reason: "removed" }));
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
    out = insertAfter(out, t, anchor);
    ctx.report.added.push(entry(ctx, { change: "insert", key, parentKey, anchor, node: t }, allowance));
  }

  return reorder(ctx, parentKey, bKids, out, tKids);
}

function reorder(
  ctx: Ctx,
  parentKey: string | null,
  bKids: ReadonlyArray<BuilderNode>,
  out: BuilderNode[],
  tKids: ReadonlyArray<BuilderNode>,
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
  const next = reorderByRank(out, (k) => rank.get(k));
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
  const allow = makeAllow(input.items);
  const trees: Record<string, BuilderNode[]> = {};
  for (const [name, ours] of Object.entries(input.ours.trees)) {
    const theirs = input.theirs.trees[name];
    if (!theirs) {
      trees[name] = ours;
      continue;
    }
    trees[name] = mergeList({ tree: name, allow, report, seq }, null, input.base.trees[name] ?? [], ours, theirs);
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
  return { trees, tokens, report };
}

/** Read helper for reports: a leaf of the node's props. */
export function leafValue(node: BuilderNode, path: string): unknown {
  return getPath(propsOf(node), path).value;
}
