/**
 * THEME RELEASES: undo ONE applied update, keeping every later edit (plan §1.5).
 *
 * Walks the report's applied / added / removed entries newest first and
 * reverts each only while the site still shows exactly what the update
 * wrote: a prop the talent changed since stays hers, an added block she
 * edited stays, a removed block comes back after its old neighbour, an order
 * she rearranged since stays. Pure.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import {
  designLeaves,
  getPath,
  isNodeEdited,
  propsOf,
  readOrigin,
  setPath,
  stableStringify,
  withOrigin,
  type Props,
} from "./origin";
import { carryContent, sameDesign } from "./swap";
import { reverseTokenEntries } from "./tokens-merge";
import {
  findKeyPath,
  hasTalentAddedDescendant,
  insertAfter,
  keyOrder,
  listAt,
  reorderByRank,
  sameList,
  updateAt,
  updateList,
} from "./tree-ops";
import type { DesignSide, MergeEntry, DesignMergeReport } from "./types";

export interface ReverseResult {
  trees: Record<string, BuilderNode[]>;
  tokens: Record<string, string>;
  reverted: MergeEntry[];
  /** Entries left in place because the talent changed that part since. */
  kept: MergeEntry[];
}

type Outcome = { tree: BuilderNode[]; done: boolean };

function revertProps(tree: BuilderNode[], e: MergeEntry): Outcome {
  const path = findKeyPath(tree, e.key);
  if (!path) return { tree, done: false };
  let done = false;
  let partial = false;
  const next = updateAt(tree, path, (node) => {
    let props: Props = propsOf(node);
    for (const c of e.changes ?? []) {
      const cur = getPath(props, c.path);
      const still = c.hasAfter
        ? cur.has && stableStringify(cur.value) === stableStringify(c.after)
        : !cur.has;
      if (!still) {
        partial = true;
        continue;
      }
      props = setPath(props, c.path, c.hadBefore, c.before);
      done = true;
    }
    const out = { ...node, props } as BuilderNode;
    return done && !partial && e.originBefore ? withOrigin(out, e.originBefore) : out;
  });
  return { tree: next, done };
}

function revertRestamp(tree: BuilderNode[], e: MergeEntry): Outcome {
  const path = findKeyPath(tree, e.key);
  if (!path || !e.originBefore || !e.originAfter) return { tree, done: false };
  let done = false;
  const next = updateAt(tree, path, (node) => {
    if (stableStringify(readOrigin(node)) !== stableStringify(e.originAfter)) return node;
    done = true;
    return withOrigin(node, e.originBefore);
  });
  return { tree: next, done };
}

function revertKind(tree: BuilderNode[], e: MergeEntry): Outcome {
  const path = findKeyPath(tree, e.key);
  if (!path || !e.node || !e.beforeNode) return { tree, done: false };
  const after = e.node;
  let done = false;
  const next = updateAt(tree, path, (node) => {
    const same =
      node.kind === after.kind &&
      stableStringify([...designLeaves(propsOf(node))]) === stableStringify([...designLeaves(propsOf(after))]);
    if (!same) return node;
    done = true;
    return e.beforeNode!;
  });
  return { tree: next, done };
}

/**
 * A layout key swap: the new node goes back to exactly her old node (edits
 * included), while it still shows the design the update wrote. Content she
 * changed on the new node since rides back onto the old one.
 */
function revertSwap(tree: BuilderNode[], e: MergeEntry): Outcome {
  const path = findKeyPath(tree, e.key);
  if (!path || !e.node || !e.beforeNode || (e.fromKey && findKeyPath(tree, e.fromKey))) {
    return { tree, done: false };
  }
  const after = e.node;
  let done = false;
  const next = updateAt(tree, path, (node) => {
    if (!sameDesign(node, after) || hasTalentAddedDescendant(node)) return node;
    done = true;
    return stableStringify(node) === stableStringify(after) ? e.beforeNode! : carryContent(node, e.beforeNode!);
  });
  return { tree: next, done };
}

function revertInsert(tree: BuilderNode[], e: MergeEntry): Outcome {
  const path = findKeyPath(tree, e.key);
  if (!path) return { tree, done: true };
  let done = false;
  const next = updateAt(tree, path, (node) => {
    if (isNodeEdited(node) || hasTalentAddedDescendant(node)) return node;
    done = true;
    return null;
  });
  return { tree: next, done };
}

function revertRemove(tree: BuilderNode[], e: MergeEntry): Outcome {
  if (!e.node || findKeyPath(tree, e.key)) return { tree, done: false };
  const next = updateList(tree, e.parentKey, (list) => insertAfter(list, e.node!, e.anchor));
  return next ? { tree: next, done: true } : { tree, done: false };
}

function revertOrder(tree: BuilderNode[], e: MergeEntry): Outcome {
  const list = listAt(tree, e.parentKey);
  if (!list || !e.beforeOrder || !e.afterOrder) return { tree, done: false };
  if (!sameList(keyOrder(list), e.afterOrder)) return { tree, done: false };
  const rank = new Map(e.beforeOrder.map((k, i) => [k, i] as const));
  const next = updateList(tree, e.parentKey, (l) => reorderByRank(l, (k) => rank.get(k)));
  return next ? { tree: next, done: true } : { tree, done: false };
}

export function reverseMerge(report: DesignMergeReport, current: DesignSide): ReverseResult {
  const entries = [...report.applied, ...report.added, ...report.removed, ...(report.restamped ?? [])].sort(
    (a, b) => b.seq - a.seq,
  );
  const tokenPass = reverseTokenEntries(
    entries.filter((e) => e.change === "token"),
    current.tokens ?? {},
  );
  const trees: Record<string, BuilderNode[]> = { ...current.trees };
  const reverted: MergeEntry[] = [...tokenPass.reverted];
  const kept: MergeEntry[] = [...tokenPass.kept];
  for (const e of entries) {
    if (e.change === "token") continue;
    const tree = e.tree ? trees[e.tree] : undefined;
    if (!tree) {
      kept.push(e);
      continue;
    }
    let outcome: Outcome;
    switch (e.change) {
      case "props":
        outcome = revertProps(tree, e);
        break;
      case "restamp":
        outcome = revertRestamp(tree, e);
        break;
      case "kind":
        outcome = revertKind(tree, e);
        break;
      case "swap":
        outcome = revertSwap(tree, e);
        break;
      case "insert":
      case "restore":
        outcome = revertInsert(tree, e);
        break;
      case "remove":
        outcome = revertRemove(tree, e);
        break;
      case "order":
        outcome = revertOrder(tree, e);
        break;
      default:
        outcome = { tree, done: false };
    }
    trees[e.tree!] = outcome.tree;
    (outcome.done ? reverted : kept).push(e);
  }
  return { trees, tokens: tokenPass.tokens, reverted, kept };
}
