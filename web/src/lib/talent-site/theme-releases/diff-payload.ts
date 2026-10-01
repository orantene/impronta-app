/**
 * THEME RELEASES: candidate release items from two versions of a Design
 * payload (plan §1.3). Pure; the admin edits types + notes before shipping.
 *
 *   token-default    a `tokenDefaults` key changed, appeared or went away
 *   variant-default  a keyed node's design-owned props changed
 *   new-block        a top-level section key new in `to`
 *   layout           a node kind swap, a key removed, a key new below a
 *                    section, or a sibling order change
 *   code             only from the notes passed in (a renderer fix has no
 *                    payload diff)
 *
 * A key removed plus a key new in the same parent and slot (a layout key
 * swap, see `swap.ts`) stays two candidates, but both carry `swap` and one
 * `group`: the merge applies them as ONE atomic choice and the talent sees one
 * item. An authored `layoutKeys` group can declare a pair detection missed.
 * `critical` is never generated: the admin flags it.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import type { DesignPayload } from "../theme-catalog/types";
import { indexTree } from "./classify";
import { designLeaves, kidsOf, stampDesignOrigin } from "./origin";
import { detectSwaps, swapGroupId } from "./swap";
import { ROOT_KEY, keyOrder, sameList } from "./tree-ops";
import type { ReleaseItem } from "./types";

export interface PayloadVersion {
  payload: DesignPayload;
  version: number;
}

export interface CandidateItem extends ReleaseItem {
  /** Changed design-owned prop paths (variant-default). */
  paths?: string[];
  /** What a layout item is about (`detail.layout` carries the same). */
  layout?: "kind" | "removed" | "nested-new" | "order";
}

const TREES = [
  ["shell", "shellTree"],
  ["home", "homeTree"],
] as const;

function diffTree(tree: string, from: BuilderNode[], to: BuilderNode[], out: CandidateItem[]): void {
  const a = indexTree(from).byKey;
  const b = indexTree(to).byKey;
  const qualified = (key: string) => `${tree}:${key}`;
  for (const [key, next] of b) {
    const prev = a.get(key);
    if (!prev) {
      const topLevel = next.parentKey === null;
      // A node inside a block that is itself new ships with that block's item.
      if (!topLevel && next.parentKey !== null && !a.has(next.parentKey)) continue;
      out.push({
        id: `${topLevel ? "new-block" : "layout"}:${tree}:${key}`,
        type: topLevel ? "new-block" : "layout",
        tree,
        key: qualified(key),
        ...(topLevel ? {} : { layout: "nested-new" as const, detail: { layout: "nested-new" } }),
      });
      continue;
    }
    if (prev.node.kind !== next.node.kind) {
      out.push({ id: `layout:${tree}:${key}:kind`, type: "layout", tree, key: qualified(key), layout: "kind", detail: { layout: "kind" } });
      continue;
    }
    const cp = [...new Set([...(prev.origin.cp ?? []), ...(next.origin.cp ?? [])])];
    const la = designLeaves(prev.node.props as Record<string, unknown>, cp);
    const lb = designLeaves(next.node.props as Record<string, unknown>, cp);
    const paths = [...new Set([...la.keys(), ...lb.keys()])]
      .filter((p) => la.get(p) !== lb.get(p))
      .sort();
    if (paths.length > 0) {
      out.push({ id: `variant-default:${tree}:${key}`, type: "variant-default", tree, key: qualified(key), paths, detail: { paths } });
    }
  }
  for (const [key] of a) {
    if (!b.has(key)) {
      out.push({ id: `layout:${tree}:${key}:removed`, type: "layout", tree, key: qualified(key), layout: "removed", detail: { layout: "removed" } });
    }
  }
  // Sibling order, per parent present on both sides.
  const parents: Array<[string, BuilderNode[], BuilderNode[]]> = [[ROOT_KEY, from, to]];
  for (const [key, prev] of a) {
    const next = b.get(key);
    if (next) parents.push([key, kidsOf(prev.node), kidsOf(next.node)]);
  }
  for (const [, prevKids, nextKids] of parents) {
    for (const pair of detectSwaps(prevKids, nextKids)) markSwap(out, tree, pair);
  }
  for (const [parentKey, prevKids, nextKids] of parents) {
    const pa = keyOrder(prevKids);
    const pb = keyOrder(nextKids);
    const common = new Set(pa.filter((k) => pb.includes(k)));
    if (!sameList(pa.filter((k) => common.has(k)), pb.filter((k) => common.has(k)))) {
      out.push({
        id: `layout:${tree}:${parentKey}:order`,
        type: "layout",
        tree,
        key: qualified(parentKey),
        layout: "order",
        detail: { layout: "order" },
      });
    }
  }
}

/** Tag both halves of a swap pair (by candidate id) with `swap` + `group`. */
export function markSwap(out: CandidateItem[], tree: string, pair: { from: string; to: string }): void {
  const fromId = `layout:${tree}:${pair.from}:removed`;
  const toIds = [`layout:${tree}:${pair.to}`, `new-block:${tree}:${pair.to}`];
  const halves = out.filter((i) => i.id === fromId || toIds.includes(i.id ?? ""));
  if (halves.length !== 2) return;
  const group = swapGroupId(tree, pair);
  for (const i of halves) {
    i.swap = { from: pair.from, to: pair.to };
    i.group = group;
    // The new half of a TOP-LEVEL swap is a layout change, not a new block: the talent
    // chooses one "layout" row (the same as a nested swap), never a block plus a removal.
    if (i.type === "new-block") {
      i.id = `layout:${tree}:${pair.to}`;
      i.type = "layout";
      i.layout = "nested-new";
      i.detail = { layout: "nested-new" };
    }
  }
}

export function diffDesignPayloads(
  design: string,
  from: PayloadVersion,
  to: PayloadVersion,
  codeNotes: ReadonlyArray<{ en?: string; es?: string }> = [],
): CandidateItem[] {
  const out: CandidateItem[] = [];
  for (const [tree, field] of TREES) {
    diffTree(
      tree,
      stampDesignOrigin(from.payload[field], { design, version: from.version }),
      stampDesignOrigin(to.payload[field], { design, version: to.version }),
      out,
    );
  }
  const ta = from.payload.tokenDefaults ?? {};
  const tb = to.payload.tokenDefaults ?? {};
  const tokenKeys = [...new Set([...Object.keys(ta), ...Object.keys(tb)])]
    .filter((k) => ta[k] !== tb[k])
    .sort();
  for (const key of tokenKeys) {
    out.push({ id: `token-default:${key}`, type: "token-default", key, detail: { from: ta[key] ?? null, to: tb[key] ?? null } });
  }
  codeNotes.forEach((note, i) => out.push({ id: `code:${i + 1}`, type: "code", key: `code:${i + 1}`, note }));
  return out;
}
