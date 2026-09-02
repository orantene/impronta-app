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
 * THE ONE PLACE a shell landmark's bespoke-component configuration is decided.
 *
 * PRECEDENCE: the landmark node's own inline `props.sectionProps` wins; the
 * addressed `cms_page_sections` slot is the FALLBACK; `{}` is the floor.
 *
 * WHY IT IS NODE-FIRST (this reverses the earlier slot-first order)
 * ----------------------------------------------------------------
 * Phase 8B must delete the legacy `site_header` / `site_footer` anchor rows to
 * reach zero `section_embed`. Once they are gone the slot is `undefined` and
 * the landmark has nothing to render from unless it carries its own config —
 * so the tree has to be able to own it. Slot-first made that capability
 * UNVERIFIABLE: a tenant could seed inline props, see no change on the live
 * site (the slot still won), delete the rows, and only then discover whether
 * the inline copy was right. Node-first makes the seed step observable while
 * the rows are still there to roll back to, which is the whole point of
 * seeding before deleting.
 *
 * THE COST, AND HOW IT IS PAID (updated 2026-09-02): for a landmark that HAS
 * inline `sectionProps`, an edit to `cms_sections.props_jsonb` alone no longer
 * reaches the live site — the tree is authoritative for that landmark. That
 * used to make the SiteHeaderInspector / SiteFooterInspector autosave silently
 * dead on any node-owned landmark. It no longer does: those actions now MIRROR
 * the same props onto the landmark node via
 * `applyShellLandmarkSectionProps` (below) / `mirrorShellLandmarkSectionProps`,
 * so the store the inspector writes is the store this function reads.
 *
 * The precedence is still inert for every shell alive today because none carry
 * inline `sectionProps`: with the field absent this function returns
 * `slot.props`, the exact expression it replaced. A tenant opts into the new
 * ownership by authoring the field, and only then.
 *
 * Non-object inline values (a stray `null`, a string) fall through to the slot
 * rather than being handed to a bespoke component that expects a record.
 */
export function resolveShellLandmarkSectionProps(
  node: BuilderNode | null | undefined,
  slot?: { props?: Record<string, unknown> } | null,
): Record<string, unknown> {
  // Only a LANDMARK may own config inline. A non-landmark section node indexed
  // at the same address is not a shell landmark and stays slot-sourced.
  if (node && isShellLandmarkNode(node)) {
    const inline = node.props.sectionProps;
    if (inline && typeof inline === "object" && !Array.isArray(inline)) {
      return inline as Record<string, unknown>;
    }
  }
  return slot?.props ?? {};
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
 * DELIBERATELY READ-ONLY, and it never overwrites: a landmark that already has
 * inline `sectionProps` is returned untouched, because as of
 * `resolveShellLandmarkSectionProps` those inline props are what the renderer
 * uses. Applied when the snapshot is LOADED, never at publish: baking a copy of
 * the slot props into the PERSISTED tree would silently promote every existing
 * slot-sourced landmark to tree-owned, moving a tenant's shell to a different
 * ownership model without anyone asking for that. Ownership must be opted into
 * by authoring the field, not acquired by passing through a publish — the same
 * rule `applyShellLandmarkSectionProps` applies on the write side.
 *
 * With ZERO slots there is nothing to source from, so the tree comes back as-is
 * — which is exactly right for a Phase 8B shell whose anchors are gone: its
 * landmarks already carry their config inline and need no hydration at all.
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

/**
 * F13 — WHICH HTML ELEMENT a shell landmark's wrapper must be.
 *
 * THE BUG THIS FIXES, measured on production 2026-09-02: the live site shipped
 * `<header>` 0, `<footer>` 0, `role=banner` 0, `role=contentinfo` 0. A screen
 * reader got no banner and no contentinfo landmark anywhere on the site, and
 * no way to skip to either.
 *
 * The cause is the interaction of two individually correct decisions. The
 * curated `site_header` / `site_footer` components each emit their own
 * `<header>` / `<footer>` root, so the wrapper around them was deliberately a
 * plain `<div>` — nesting two `<header>`s would produce two banner landmarks.
 * But an EJECTED landmark suppresses that curated component and renders only
 * its authored children, so the one element carrying the semantics disappeared
 * with it and the `<div>` was all that remained. Ejection was designed to
 * replace the curated BAR, not to strip the page of its landmarks.
 *
 * Hence the rule: the wrapper takes over the semantics exactly when the
 * component that used to carry them is not rendering.
 *
 *   - not ejected → `div`. The curated component emits the landmark itself, so
 *     a semantic wrapper here would DOUBLE it. Unchanged from before this fix,
 *     which is what keeps every non-ejected tenant byte-identical.
 *   - ejected `site_header` → `<header role="banner">`
 *   - ejected `site_footer` → `<footer role="contentinfo">`
 *
 * WHY THE ROLE IS EXPLICIT rather than left to the implicit mapping: `<header>`
 * only maps to `banner` when it is NOT a descendant of `article`, `aside`,
 * `main`, `nav` or `section`. The shell's mount point is a page-level decision
 * this pure module cannot see, and a tenant page that ever nests the shell side
 * inside one of those would silently lose the landmark again — the exact
 * failure mode being fixed. Stating the role costs one attribute and cannot
 * regress: it is the same role the implicit mapping would assign.
 *
 * Safe on the styling side because every shell selector is attribute-qualified
 * (`[data-cms-section]`, `[data-section-type-key="site_header"]`) and none is
 * element-qualified, and the editor selection layer matches the same
 * attributes rather than a tag name.
 */
export function shellLandmarkWrapper(input: {
  sectionTypeKey: string | null | undefined;
  ejected: boolean;
}): { element: "div" | "header" | "footer"; role?: "banner" | "contentinfo" } {
  if (!input.ejected) return { element: "div" };
  if (input.sectionTypeKey === "site_header") {
    return { element: "header", role: "banner" };
  }
  if (input.sectionTypeKey === "site_footer") {
    return { element: "footer", role: "contentinfo" };
  }
  return { element: "div" };

* THE WRITE COUNTERPART to `resolveShellLandmarkSectionProps`.
 *
 * It lives in THIS module, immediately below the read precedence it mirrors,
 * for one reason: the two must never drift. `resolveShellLandmarkSectionProps`
 * decides which store the RENDERER reads a landmark's config from; this decides
 * which store the SiteHeaderInspector / SiteFooterInspector autosave WRITES it
 * to. When those two answers disagree the operator edits header configuration,
 * gets a success state, and the live site does not change — the exact silent
 * failure this repo keeps re-shipping.
 *
 * FOLLOW OWNERSHIP; NEVER CREATE IT
 * ---------------------------------
 * A landmark that already carries an inline `props.sectionProps` OBJECT is
 * node-owned: the renderer reads the node, so the inspector must write the
 * node. A landmark WITHOUT the field is slot-owned: the renderer reads
 * `cms_sections.props_jsonb` through the snapshot slot, so the inspector's
 * existing row write already reaches the live site and the tree must be left
 * strictly alone.
 *
 * Promotion — writing the field onto a landmark that lacks it — is deliberately
 * NOT done here. `hydrateShellLandmarkSectionProps` refuses to promote at
 * publish for a stated reason: ownership is opted into by authoring the field,
 * never acquired by passing through some unrelated code path. An inspector that
 * promoted on first edit would make a tenant's migration state depend on the
 * order an operator happened to click their tabs in. Phase 8B's seed is the one
 * deliberate, auditable promotion step; this function is what keeps the
 * inspector alive on either side of it — including on a HALF-MIGRATED shell
 * whose header is node-owned while its footer is still slot-owned, because each
 * landmark is decided independently, exactly as the renderer decides it.
 *
 * CONSEQUENCE, STATED PLAINLY: no shell alive today has a landmark carrying
 * inline `sectionProps`, so this returns `changed: false` and the SAME tree
 * reference, and its caller performs no `cms_pages` write at all. Today's
 * behaviour is byte-identical to before this function existed.
 *
 * The node is copied shallowly with `children` intact — a landmark's
 * operator-added freeform children are not part of `sectionProps` and must
 * survive an inspector save untouched.
 */
export function applyShellLandmarkSectionProps(
  tree: BuilderNodeTree,
  side: ShellSideKey,
  nextProps: Record<string, unknown>,
): { tree: BuilderNodeTree; changed: boolean } {
  if (!Array.isArray(tree) || tree.length === 0) {
    return { tree, changed: false };
  }
  const typeKey = SHELL_LANDMARK_SECTION_TYPE[side];
  let changed = false;
  const next = tree.map((node) => {
    if (!isShellLandmarkNode(node)) return node;
    if (node.props.sectionTypeKey !== typeKey) return node;
    const inline = node.props.sectionProps;
    // Slot-owned landmark: the row write already reaches the renderer. Leave it.
    if (!inline || typeof inline !== "object" || Array.isArray(inline)) {
      return node;
    }
    changed = true;
    return {
      ...node,
      props: { ...node.props, sectionProps: nextProps },
    } satisfies BuilderNode;
  });
  return changed ? { tree: next, changed: true } : { tree, changed: false };
}

/**
 * The READ half of the same rule: the inline `sectionProps` record when this
 * side's landmark owns its config, `null` when it is slot-owned or absent.
 *
 * An inspector that WRITES the node but still DISPLAYS
 * `cms_sections.props_jsonb` shows the operator a stale value and then saves it
 * back over the node — the same silent failure wearing the other face. This
 * matters even before Phase 8B, because a shell template applied on the
 * freeform surface can carry inline `sectionProps` the section row never saw.
 */
export function readShellLandmarkInlineSectionProps(
  tree: BuilderNodeTree,
  side: ShellSideKey,
): Record<string, unknown> | null {
  if (!Array.isArray(tree)) return null;
  const typeKey = SHELL_LANDMARK_SECTION_TYPE[side];
  for (const node of tree) {
    if (!isShellLandmarkNode(node)) continue;
    if (node.props.sectionTypeKey !== typeKey) continue;
    const inline = node.props.sectionProps;
    if (inline && typeof inline === "object" && !Array.isArray(inline)) {
      return inline as Record<string, unknown>;
    }
  }
  return null;
}
