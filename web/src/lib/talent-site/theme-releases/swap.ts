/**
 * THEME RELEASES: layout key swaps (plan §1.4, atomic layout items).
 *
 * A layout change can be authored as a key swap: the old keyed node goes away
 * and a new keyed node takes its place in the same parent (v17 services
 * `services_catalog` to `services_two_col`, the 2.1 hero inset `image#2` to
 * `hero_inset_bl`). The two halves are ONE choice: the merge swaps them
 * together or not at all, so a site never ends up with both.
 *
 * Detection (shared by `diffDesignPayloads` and the merge): in one sibling
 * list, a key only in `from` pairs with a key only in `to` when both sit at
 * the same keyed position with the same kind; failing that, when they are
 * the only removed/new pair of that kind in the list. Pure.
 *
 * Carrying edits: content-owned props (`cp`, `i18n`) always travel. A
 * design-owned prop the talent changed travels when the new node still has
 * that prop (or she added a prop and the kind is the same); an edit to a prop
 * the new layout dropped cannot be carried (unmappable).
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import {
  designLeafValues,
  getPath,
  isNodeEdited,
  kidsOf,
  propsOf,
  readOrigin,
  setPath,
  stableStringify,
  type Props,
} from "./origin";
import { hasTalentAddedDescendant, keyOf, keyOrder, keyedMap } from "./tree-ops";

export interface SwapPair {
  from: string;
  to: string;
  /**
   * `to` already exists in the base design (it shipped earlier as an optional
   * block) and `from` is going away. The swap then guarantees a replacement:
   * if her site has `to`, `from` is just removed; if not, `to` is inserted at
   * `from`'s position in the same apply. She can never end up with neither.
   */
  ensure?: boolean;
}

/** Swap pairs in one sibling list (`a` = older design, `b` = newer design). */
export function detectSwaps(a: ReadonlyArray<BuilderNode>, b: ReadonlyArray<BuilderNode>): SwapPair[] {
  const aMap = keyedMap(a);
  const bMap = keyedMap(b);
  const aOrder = keyOrder(a);
  const bOrder = keyOrder(b);
  const removed = aOrder.filter((k) => !bMap.has(k));
  const added = bOrder.filter((k) => !aMap.has(k));
  const pairs: SwapPair[] = [];
  const used = new Set<string>();
  // Same keyed position, same kind.
  for (const from of removed) {
    const to = added.find(
      (k) => !used.has(k) && bOrder.indexOf(k) === aOrder.indexOf(from) && bMap.get(k)!.kind === aMap.get(from)!.kind,
    );
    if (to) {
      pairs.push({ from, to });
      used.add(from);
      used.add(to);
    }
  }
  // The only removed/new pair of a kind in this list.
  const kinds = new Set(removed.filter((k) => !used.has(k)).map((k) => aMap.get(k)!.kind));
  for (const kind of kinds) {
    const r = removed.filter((k) => !used.has(k) && aMap.get(k)!.kind === kind);
    const n = added.filter((k) => !used.has(k) && bMap.get(k)!.kind === kind);
    if (r.length === 1 && n.length === 1) {
      pairs.push({ from: r[0]!, to: n[0]! });
      used.add(r[0]!);
      used.add(n[0]!);
    }
  }
  return pairs;
}

/** Stable group id of a swap (both halves carry it). */
export function swapGroupId(tree: string, pair: SwapPair): string {
  return `layout-swap:${tree}:${pair.from}`;
}

/** Fields `validateBuilderNodeTree` mirrors from props onto the node base. */
const BASE_MIRRORS = ["locked", "lockedProps", "visibilityCondition", "i18n", "experiment", "anchorId"] as const;

function withProps(node: BuilderNode, props: Props): BuilderNode {
  const out = { ...node, props } as Record<string, unknown>;
  for (const k of BASE_MIRRORS) {
    if (props[k] !== undefined) out[k] = props[k];
    else delete out[k];
  }
  return out as unknown as BuilderNode;
}

function unionCp(...nodes: BuilderNode[]): string[] {
  const out = new Set<string>();
  for (const n of nodes) for (const p of readOrigin(n)?.cp ?? []) out.add(p);
  return [...out];
}

function anyEditedDescendant(node: BuilderNode): boolean {
  return kidsOf(node).some((k) => isNodeEdited(k) || anyEditedDescendant(k));
}

export interface CarryResult {
  /** The new node carrying her content and mappable edits. */
  node: BuilderNode;
  /** Design-owned paths she changed that now ride on the new node. */
  moved: string[];
  /** Paths (or `children`) that cannot ride on the new node. */
  unmappable: string[];
}

/**
 * Build the new node `t` with the talent's content and edits from `o`
 * (`b` = the old node as the base design seeded it). `t` keeps its own stamp,
 * so a node that carries edits reads as edited from then on.
 */
export function carryEdits(b: BuilderNode, o: BuilderNode, t: BuilderNode): CarryResult {
  const oProps = propsOf(o);
  const bProps = propsOf(b);
  let props: Props = { ...propsOf(t) };
  const moved: string[] = [];
  const unmappable: string[] = [];

  // Her translations always travel.
  if (oProps.i18n !== undefined) props.i18n = oProps.i18n;
  else delete props.i18n;

  // Content-owned leaves (her text, her photo).
  const tCp = new Set(readOrigin(t)?.cp ?? []);
  for (const p of readOrigin(o)?.cp ?? []) {
    const ov = getPath(oProps, p);
    if (tCp.has(p) || getPath(props, p).has) {
      props = setPath(props, p, ov.has, ov.value);
    } else if (stableStringify(ov.value) !== stableStringify(getPath(bProps, p).value)) {
      unmappable.push(p);
    }
  }

  // Design-owned leaves she changed.
  const cp = unionCp(b, o, t);
  const B = designLeafValues(bProps, cp);
  const O = designLeafValues(oProps, cp);
  const T = designLeafValues(propsOf(t), cp);
  const changed = [...new Set([...B.keys(), ...O.keys()])]
    .filter((p) => B.has(p) !== O.has(p) || stableStringify(B.get(p)) !== stableStringify(O.get(p)))
    .sort();
  const same = (m: Map<string, unknown>, n: Map<string, unknown>, p: string) =>
    m.has(p) === n.has(p) && stableStringify(m.get(p)) === stableStringify(n.get(p));
  for (const p of changed) {
    if (!same(B, T, p) && !same(O, T, p)) {
      // The new layout itself redefines this prop: her value and the layout collide.
      unmappable.push(p);
    } else if (T.has(p) || (!B.has(p) && o.kind === t.kind)) {
      props = setPath(props, p, O.has(p), O.get(p));
      moved.push(p);
    } else if (!O.has(p)) {
      // She cleared a prop the new layout does not use either: nothing to carry.
      moved.push(p);
    } else {
      unmappable.push(p);
    }
  }

  if (hasTalentAddedDescendant(o) || anyEditedDescendant(o)) unmappable.push("children");
  return { node: withProps(t, props), moved, unmappable };
}

/** Content leaves + i18n of `from` copied onto `to` (undo keeps later content edits). */
export function carryContent(from: BuilderNode, to: BuilderNode): BuilderNode {
  const fProps = propsOf(from);
  let props: Props = { ...propsOf(to) };
  if (fProps.i18n !== undefined) props.i18n = fProps.i18n;
  else delete props.i18n;
  const cp = new Set([...(readOrigin(from)?.cp ?? []), ...(readOrigin(to)?.cp ?? [])]);
  for (const p of cp) {
    const fv = getPath(fProps, p);
    if (getPath(props, p).has || fv.has) props = setPath(props, p, fv.has, fv.value);
  }
  return withProps(to, props);
}

/** Design-owned props (and kind) equal: the node still shows what the update wrote. */
export function sameDesign(a: BuilderNode, b: BuilderNode): boolean {
  if (a.kind !== b.kind || keyOf(a) !== keyOf(b)) return false;
  const cp = unionCp(a, b);
  return (
    stableStringify([...designLeafValues(propsOf(a), cp)]) === stableStringify([...designLeafValues(propsOf(b), cp)])
  );
}
