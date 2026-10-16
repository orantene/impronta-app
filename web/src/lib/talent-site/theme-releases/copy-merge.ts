/**
 * THEME RELEASES: the per-leaf COPY rule of the three-way merge. Pure.
 *
 * Default copy (the base text a Design seeds and its `i18n` translations) is
 * owned leaf by leaf, not by the node fingerprint (`origin.ts` `copyLeaves`).
 * With B = the Design at her pinned version, O = her node, T = the target:
 *
 *   B[p] == T[p]            nothing shipped for this leaf
 *   O[p] already == T[p]    already there (a rerun, or she typed the same)
 *   O[p] == B[p]            untouched: write T[p], EVEN when the node is
 *                           otherwise edited (her style edit stays)
 *   O[p] != B[p]            hers: keep it; an `i18n` leaf is reported as a
 *                           copy conflict ("kept N texts you changed")
 *
 * A locale the seed never carried has no B and no T leaf, so it is never
 * touched. A `{{token}}` leaf is content-owned and is not a copy leaf.
 *
 * Gate: copy is written only under a release item of type `copy` for the node
 * key. With items present but none of that type, the diff is reported as
 * pending (not_in_release) so nothing ships by surprise. No items = the whole
 * update, as for every other change.
 *
 * Base text props of a node that is NOT edited are design leaves and ship
 * through the ordinary node rule (that rule already restamps the fingerprint);
 * this pass owns them only on an edited node, where it writes the leaf alone.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import {
  copyLeaves,
  getCopyLeaf,
  isI18nCopyPath,
  isNodeEdited,
  propsOf,
  readOrigin,
  setNodeCopyLeaf,
} from "./origin";
import type { AllowFn } from "./policy";
import type { DesignMergeReport, LeafChange, MergeEntry } from "./types";

export interface CopyCtx {
  tree: string;
  allow: AllowFn;
  report: DesignMergeReport;
  seq: () => number;
}

interface Triple {
  B: Map<string, string>;
  O: Map<string, string>;
  T: Map<string, string>;
  /** Paths where the design moved (B != T), sorted. */
  changed: string[];
}

function unionCp(...nodes: BuilderNode[]): string[] {
  const out = new Set<string>();
  for (const n of nodes) for (const p of readOrigin(n)?.cp ?? []) out.add(p);
  return [...out];
}

function same(a: Map<string, string>, b: Map<string, string>, p: string): boolean {
  return a.has(p) === b.has(p) && a.get(p) === b.get(p);
}

function triple(b: BuilderNode, o: BuilderNode, t: BuilderNode): Triple {
  const cp = unionCp(b, o, t);
  const B = copyLeaves(propsOf(b), cp, b.kind);
  const O = copyLeaves(propsOf(o), cp, o.kind);
  const T = copyLeaves(propsOf(t), cp, t.kind);
  const paths = new Set([...B.keys(), ...T.keys()]);
  return { B, O, T, changed: [...paths].filter((p) => !same(B, T, p)).sort() };
}

/** Of `paths`, the ones that are default-copy leaves of the node (in the base or the target). */
export function copyPathsAmong(b: BuilderNode, t: BuilderNode, cp: ReadonlyArray<string>, paths: ReadonlyArray<string>): string[] {
  const B = copyLeaves(propsOf(b), cp, b.kind);
  const T = copyLeaves(propsOf(t), cp, t.kind);
  return paths.filter((p) => B.has(p) || T.has(p));
}

function leafChanges(paths: string[], from: Map<string, string>, to: Map<string, string>): LeafChange[] {
  return paths.map((path) => ({
    path,
    hadBefore: from.has(path),
    ...(from.has(path) ? { before: from.get(path) } : {}),
    hasAfter: to.has(path),
    ...(to.has(path) ? { after: to.get(path) } : {}),
  }));
}

/**
 * Base copy paths the copy pass writes on an EDITED node (the design rule keeps
 * the whole node there). The node rule leaves these out of its "kept" report.
 */
export function copyOwnedBasePaths(
  b: BuilderNode,
  o: BuilderNode,
  t: BuilderNode,
  allow: AllowFn,
  tree: string,
  key: string,
): Set<string> {
  const out = new Set<string>();
  if (o.kind !== t.kind || b.kind !== t.kind || !isNodeEdited(o) || !allow("copy", key, tree).ok) return out;
  const { O, B, T, changed } = triple(b, o, t);
  for (const p of changed) if (!isI18nCopyPath(p) && same(O, B, p) && !same(O, T, p)) out.add(p);
  return out;
}

/** Apply the copy rule to a node the design rule already merged. */
export function mergeCopy(
  ctx: CopyCtx,
  key: string,
  b: BuilderNode,
  o: BuilderNode,
  t: BuilderNode,
  merged: BuilderNode,
): BuilderNode {
  if (o.kind !== t.kind || b.kind !== t.kind || merged.kind !== t.kind) return merged;
  const { O, B, T, changed } = triple(b, o, t);
  if (changed.length === 0) return merged;
  const cur = copyLeaves(propsOf(merged), unionCp(b, o, t), merged.kind);
  const edited = isNodeEdited(o);

  const writes: string[] = [];
  const kept: string[] = [];
  for (const p of changed) {
    if (same(cur, T, p)) continue; // already there
    const i18n = isI18nCopyPath(p);
    if (!i18n && !edited) continue; // an unedited node's base text ships with the node rule
    if (same(O, B, p)) writes.push(p);
    else if (i18n) kept.push(p);
  }
  if (writes.length === 0 && kept.length === 0) return merged;

  const allowance = ctx.allow("copy", key, ctx.tree);
  const make = (fields: Omit<MergeEntry, "seq" | "tree" | "change" | "key">): MergeEntry => ({
    seq: ctx.seq(),
    tree: ctx.tree,
    change: "props",
    key,
    prop: (fields.changes ?? []).map((c) => c.path).join(","),
    ...fields,
    ...(allowance.itemId ? { itemId: allowance.itemId } : {}),
    ...(allowance.itemType ? { itemType: allowance.itemType } : {}),
  });

  if (!allowance.ok) {
    if (writes.length > 0) {
      ctx.report.pending.push(make({ changes: leafChanges(writes, cur, T), reason: "not_in_release" }));
    }
    return merged;
  }
  if (kept.length > 0) {
    ctx.report.conflicts.push(make({ changes: leafChanges(kept, O, T), reason: "copy_edited" }));
  }
  if (writes.length === 0) return merged;

  let node = merged;
  for (const p of writes) node = setNodeCopyLeaf(node, p, T.get(p));
  ctx.report.applied.push(make({ changes: leafChanges(writes, cur, T), reason: "copy_applied" }));
  return node;
}

/** Is this report entry a copy conflict (her text kept over a new default)? */
export function isCopyConflict(e: Pick<MergeEntry, "reason">): boolean {
  return e.reason === "copy_edited";
}

/** Texts she changed that the update left alone: leaves across the copy conflicts. */
export function countCopyKept(conflicts: ReadonlyArray<Pick<MergeEntry, "reason" | "changes">>): number {
  let n = 0;
  for (const e of conflicts) if (isCopyConflict(e)) n += e.changes?.length ?? 1;
  return n;
}

/**
 * Undo one applied copy entry on a node: each leaf goes back only while it
 * still holds what the update wrote. Returns the node and whether anything moved.
 */
export function revertCopyEntry(node: BuilderNode, e: MergeEntry): { node: BuilderNode; done: boolean } {
  let next = node;
  let done = false;
  for (const c of e.changes ?? []) {
    const cur = getCopyLeaf(propsOf(next), c.path);
    const still = c.hasAfter ? cur === c.after : cur === undefined;
    if (!still) continue;
    next = setNodeCopyLeaf(next, c.path, c.hadBefore ? (c.before as string) : undefined);
    done = true;
  }
  return { node: next, done };
}
