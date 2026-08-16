/**
 * F3 — the PURE decision layer for how the published site shell renders.
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * `<PublishedShell>` used to render the shell by walking `snapshot.slots` and,
 * for each slot, looking up the ONE builder node whose address key
 * (`sectionId:slotKey:sortOrder`) matched. Anything else in the tree — in
 * particular a ROOT-LEVEL node an operator added on the freeform shell surface
 * (an announcement bar above the header, a newsletter strip under the footer) —
 * was silently dropped. The operator saw it on the edit canvas, published, and
 * it never appeared on the live site. That is audit finding F3.
 *
 * The proven model is the talent Max site (`render-max-site.tsx`): the freeform
 * tree is authoritative, `splitShell()` cuts it into a header half and a footer
 * half, and every root renders — landmarks through their bespoke section
 * component, everything else through `renderBuilderNodes`. This module is that
 * model, ported for the agency shell and factored PURE so the decision is
 * unit-testable with no DB, no React, and no server runtime.
 *
 * THE PRIME DIRECTIVE: THE LEGACY PATH MUST NOT MOVE
 * --------------------------------------------------
 * Every tenant on the shell today (Impronta is the only one — see the launch
 * allow-list in `site-shell-flag.ts`) has an EMPTY `cms_pages.blocks` and a
 * snapshot whose `builderTree` is `buildLegacySectionBuilderTree(slots)`. For
 * those, `resolveShellSidePlan` returns `{ mode: "legacy_slot" }` carrying the
 * exact same slot object the old code picked, and the renderer runs the exact
 * same code it ran before. Byte-equivalence is therefore structural, not
 * "carefully re-derived" — the legacy branch is the untouched original.
 *
 * PURITY: no I/O, no React, no runtime imports beyond the builder-node address
 * helper. Keep it that way — `PublishedShell.tsx` statically imports ~20 modules
 * and runs on every public page; the TDZ module-cycle sev-1
 * (`incident_card_design_token_keys_tdz_cycle`) came from exactly this surface.
 */

import { builderSectionNodeAddressKey } from "./snapshot-tree";
import type { BuilderNode, BuilderNodeTree } from "./types";

/** The two shell sides, each rendered by its own Server Component. */
export type ShellSideKey = "header" | "footer";

/** Section type key of each side's landmark node. */
export const SHELL_LANDMARK_SECTION_TYPE: Readonly<
  Record<ShellSideKey, string>
> = {
  header: "site_header",
  footer: "site_footer",
};

/**
 * The slot shape both `HomepageSnapshotSection` and `LegacySnapshotSlot`
 * satisfy. Declared structurally so this leaf module imports neither.
 */
export interface ShellSnapshotSlotLike {
  slotKey: string;
  sortOrder: number;
  sectionId: string;
  sectionTypeKey: string;
  props?: Record<string, unknown>;
}

/** A `site_header` / `site_footer` freeform section node. */
export type ShellLandmarkNode = Extract<BuilderNode, { kind: "section" }>;

export function isShellLandmarkNode(node: BuilderNode): node is ShellLandmarkNode {
  return (
    node?.kind === "section" &&
    (node.props?.sectionTypeKey === "site_header" ||
      node.props?.sectionTypeKey === "site_footer")
  );
}

function nodeAddressKey(node: BuilderNode): string | null {
  if (node?.kind !== "section") return null;
  return builderSectionNodeAddressKey({
    sectionId: node.props?.sectionId ?? "",
    slotKey: node.props?.slotKey,
    sortOrder: node.props?.sortOrder,
  });
}

function slotAddressKeys(
  slots: ReadonlyArray<ShellSnapshotSlotLike>,
): ReadonlySet<string> {
  const out = new Set<string>();
  for (const slot of slots) {
    const key = builderSectionNodeAddressKey({
      sectionId: slot.sectionId,
      slotKey: slot.slotKey,
      sortOrder: slot.sortOrder,
    });
    if (key) out.add(key);
  }
  return out;
}

export type ShellTreeAuthoring = "legacy_slots" | "freeform";

/**
 * Is this shell tree the LEGACY generated one, or was it authored on the
 * freeform shell surface?
 *
 * The test is deliberately narrow: the tree is "legacy" when EVERY root is a
 * section node whose address key matches a snapshot slot — which is exactly
 * what `buildLegacySectionBuilderTree(slots)` produces, and exactly the shape
 * the slot-addressed renderer handles losslessly. One root that is not a
 * slot-addressed section (an operator's announcement bar, an un-addressed
 * landmark from an applied shell template) means the slot-addressed renderer
 * would DROP content, so the tree takes the freeform path.
 *
 * Note the deliberate consequence: a freeform-authored tree consisting of
 * nothing but the two addressed landmarks classifies as "legacy". That is
 * correct — for that shape the two renderers produce identical output, so the
 * conservative branch is the right one.
 */
export function classifyShellTree(
  tree: BuilderNodeTree,
  slots: ReadonlyArray<ShellSnapshotSlotLike>,
): ShellTreeAuthoring {
  if (!Array.isArray(tree) || tree.length === 0) return "legacy_slots";
  const addressed = slotAddressKeys(slots);
  for (const node of tree) {
    if (node?.kind !== "section") return "freeform";
    const key = nodeAddressKey(node);
    if (!key || !addressed.has(key)) return "freeform";
  }
  return "legacy_slots";
}

/**
 * Split a shell tree into its HEADER half and FOOTER half.
 *
 * Ported from `splitShell()` in `render-max-site.tsx`, with the landmark rule
 * added in front because the agency shell always has typed landmarks and they
 * are a far stronger signal than a layer label:
 *
 *   1. A `site_footer` landmark cuts the tree: everything before it is header,
 *      it and everything after it is footer. Operator-added roots therefore
 *      land on the side they were authored on.
 *   2. Otherwise, roots whose `layerLabel` contains "footer" are the footer
 *      (the talent default shell's convention).
 *   3. Otherwise, if a `site_header` landmark exists, the whole tree is the
 *      header and there is NO footer half. This is where the port deliberately
 *      diverges from the talent heuristic: "the last root is the footer" would
 *      teleport an operator's node from just-under-the-header to the bottom of
 *      the page, and the two halves are mounted by different components in
 *      different page positions, so a wrong guess is very visible.
 *   4. Otherwise (a landmark-less, label-less tree) fall back to the talent
 *      rule verbatim: last root is the footer, the rest is the header.
 */
export function splitShellTree(tree: BuilderNodeTree): {
  header: BuilderNode[];
  footer: BuilderNode[];
} {
  if (!Array.isArray(tree) || tree.length === 0) return { header: [], footer: [] };

  const footerLandmarkIndex = tree.findIndex(
    (node) =>
      isShellLandmarkNode(node) && node.props.sectionTypeKey === "site_footer",
  );
  if (footerLandmarkIndex >= 0) {
    return {
      header: tree.slice(0, footerLandmarkIndex),
      footer: tree.slice(footerLandmarkIndex),
    };
  }

  const labelOf = (node: BuilderNode): string =>
    String((node.props as { layerLabel?: unknown })?.layerLabel ?? "").toLowerCase();
  const footerByLabel = tree.filter((node) => labelOf(node).includes("footer"));
  if (footerByLabel.length > 0) {
    const footerSet = new Set(footerByLabel);
    return {
      header: tree.filter((node) => !footerSet.has(node)),
      footer: footerByLabel,
    };
  }

  const hasHeaderLandmark = tree.some(
    (node) =>
      isShellLandmarkNode(node) && node.props.sectionTypeKey === "site_header",
  );
  if (hasHeaderLandmark) return { header: [...tree], footer: [] };

  if (tree.length === 1) return { header: [...tree], footer: [] };
  return { header: tree.slice(0, -1), footer: tree.slice(-1) };
}

/**
 * LAZY `sectionProps` HYDRATION (read-side).
 *
 * A shell landmark authored on the freeform surface carries only its identity
 * (`sectionTypeKey` / `slotKey` / `sortOrder` / `sectionId`); the bespoke
 * component's configuration lives in `cms_sections.props_jsonb`, reachable
 * through the snapshot slot. The talent Max site instead carries that config
 * INLINE as `props.sectionProps`, which is what lets its landmarks render with
 * no slot table at all. This function bridges the two: any landmark that has no
 * inline `sectionProps` gets it from the current slot composition, matched by
 * address key first and by side (`site_header` → the `header` slot) second.
 *
 * DELIBERATELY READ-ONLY. It is applied when the shell snapshot is LOADED, not
 * when it is published, and the renderer still prefers the live slot's props
 * whenever the landmark is address-matched. Baking a copy of the slot props
 * into the persisted tree at publish time would make the tree and the slot able
 * to DRIFT — and since the renderer would then be reading the baked copy, a
 * later `cms_sections.props_jsonb` edit (the SiteHeaderInspector autosave path)
 * would stop taking effect on the live site. That is the same silent-write-drop
 * shape as the F2 bug this lane's predecessor fixed. Hydrating on read gets the
 * whole benefit — an un-addressed landmark renders its real configuration —
 * with none of the drift.
 *
 * Pure and allocation-frugal: returns the SAME array reference when nothing
 * needed hydrating (the legacy case and the already-hydrated case).
 */
export function hydrateShellLandmarkSectionProps(
  tree: BuilderNodeTree,
  slots: ReadonlyArray<ShellSnapshotSlotLike>,
): BuilderNodeTree {
  if (!Array.isArray(tree) || tree.length === 0) return tree;
  if (!Array.isArray(slots) || slots.length === 0) return tree;

  const byAddress = new Map<string, ShellSnapshotSlotLike>();
  const bySlotKey = new Map<string, ShellSnapshotSlotLike>();
  for (const slot of slots) {
    const key = builderSectionNodeAddressKey({
      sectionId: slot.sectionId,
      slotKey: slot.slotKey,
      sortOrder: slot.sortOrder,
    });
    if (key && !byAddress.has(key)) byAddress.set(key, slot);
    if (!bySlotKey.has(slot.slotKey)) bySlotKey.set(slot.slotKey, slot);
  }

  let changed = false;
  const next = tree.map((node) => {
    if (!isShellLandmarkNode(node)) return node;
    if (node.props.sectionProps !== undefined) return node;
    const address = nodeAddressKey(node);
    const side: ShellSideKey =
      node.props.sectionTypeKey === "site_footer" ? "footer" : "header";
    const slot =
      (address ? byAddress.get(address) : undefined) ?? bySlotKey.get(side);
    if (!slot) return node;
    changed = true;
    return {
      ...node,
      props: { ...node.props, sectionProps: slot.props ?? {} },
    } satisfies BuilderNode;
  });
  return changed ? next : tree;
}

/**
 * Classify a resolved shell snapshot tree and, ONLY when it is freeform,
 * hydrate its landmarks' `sectionProps`. A legacy slot-baked tree comes back
 * byte-identical (same array reference), which is what keeps the legacy render
 * path provably unchanged: it is handed the very object it was handed before.
 */
export function prepareShellTree(
  tree: BuilderNodeTree,
  slots: ReadonlyArray<ShellSnapshotSlotLike>,
): { authoring: ShellTreeAuthoring; tree: BuilderNodeTree } {
  const authoring = classifyShellTree(tree, slots);
  if (authoring === "legacy_slots") return { authoring, tree };
  return { authoring, tree: hydrateShellLandmarkSectionProps(tree, slots) };
}

/**
 * What one side of the published shell should render.
 *
 *   - `legacy_slot` — render the slot through the pre-existing slot-addressed
 *     path, unchanged. Carries the very slot object the old code selected.
 *   - `freeform`    — render these tree roots directly, in order.
 *   - `none`        — this side has nothing; the caller renders null.
 */
export type ShellSidePlan<S extends ShellSnapshotSlotLike = ShellSnapshotSlotLike> =
  | { mode: "legacy_slot"; slot: S }
  | { mode: "freeform"; nodes: ReadonlyArray<BuilderNode> }
  | { mode: "none" };

/**
 * THE renderer decision. One function, three outcomes, no I/O.
 *
 * Fallback discipline, in order:
 *   1. Legacy / slot-baked tree → the legacy slot path (or `none` when the side
 *      has no slot, which is what the old code did too).
 *   2. Freeform tree with nodes on this side → render them directly. This is
 *      the F3 fix.
 *   3. Freeform tree with NOTHING on this side but a slot that exists → the
 *      legacy slot path. Without this belt, a freeform tree carrying only a
 *      header landmark would make `PublishedShellFooter` render null and the
 *      live page would lose its footer entirely (the legacy footer is already
 *      suppressed by `shouldRenderSnapshotShell`).
 */
export function resolveShellSidePlan<S extends ShellSnapshotSlotLike>(input: {
  tree: BuilderNodeTree;
  slots: ReadonlyArray<S>;
  side: ShellSideKey;
}): ShellSidePlan<S> {
  const { tree, slots, side } = input;
  const slot = slots.find((s) => s.slotKey === side);

  if (classifyShellTree(tree, slots) === "legacy_slots") {
    return slot ? { mode: "legacy_slot", slot } : { mode: "none" };
  }

  const nodes = splitShellTree(tree)[side];
  if (nodes.length > 0) return { mode: "freeform", nodes };
  return slot ? { mode: "legacy_slot", slot } : { mode: "none" };
}

/**
 * The freeform nodes a side's data sources must be resolved over: each
 * landmark's children plus every non-landmark root, in render order. The
 * landmark itself is not included — it renders through its bespoke section
 * component, not through `renderBuilderNodes`.
 */
export function collectShellSideFreeformNodes(
  nodes: ReadonlyArray<BuilderNode>,
): BuilderNode[] {
  const out: BuilderNode[] = [];
  for (const node of nodes) {
    if (isShellLandmarkNode(node)) {
      out.push(...(node.children ?? []));
      continue;
    }
    out.push(node);
  }
  return out;
}
