/**
 * kind-governance.ts — Builder Studio (WS-C).
 *
 * The catalog governance overlay (C1 `locked_props`, C2 `default_props`, C3
 * `default_variant`, C4 `data_source_defaults`) is carried on each
 * `AddGalleryItem` by `applyCatalogOverlay`. The MAIN "+" Add Gallery insert
 * applies it via `resolveAddGalleryInsertAction` → `applyItemOverlayAtInsert`.
 *
 * But the editor's QUICK-ADD paths (section "ADD BLOCK" chips, freeform insert
 * popover, between-blocks insert, empty-canvas starter, the Content-tab
 * `commitInsert`) insert by raw KIND — `insertBuilderNode(parentId, kind)` →
 * `createBuilderNode(kind)` — and never touch the gallery item, so a governed
 * component inserted that way came out UNgoverned (no lock, no default).
 *
 * A SECOND ungoverned path is the curated `section_embed` / `connectedNode`
 * insert: `insertBuilderSectionEmbed(parentId, sectionTypeKey)` builds the node
 * via `createBuilderSectionEmbed(sectionTypeKey)` and likewise never touches the
 * gallery item. `resolveSectionEmbedGovernance` + `governSectionEmbedNode`
 * (below) close that gap the same way, keyed on `sectionEmbedKey`.
 *
 * This module closes that gap with a PURE kind→governance resolver:
 *   - `resolveKindGovernance(kind, items)` finds the native catalog item that
 *     represents the PLAIN insert of `kind` (the item whose `nativeKind === kind`
 *     and which carries NO `nativeVariant` — the exact governance counterpart of
 *     `createBuilderNode(kind)`), and returns its overlay
 *     `{ lockedProps, defaultProps, dataSourceDefaults }`.
 *   - `applyKindGovernanceAtInsert(node, governance)` stamps that overlay onto a
 *     freshly-created raw node, REUSING the same `applyItemDefaultProps` +
 *     `applyItemDataSourceDefaults` + `stampItemLockedProps` helpers the gallery
 *     path uses, in the SAME order (defaults → data-source defaults → locks).
 *
 * INVARIANTS (must hold so the core insert path is unchanged when nothing is
 * governed, and so the main gallery path never double-applies):
 *   - No matching item, or a matching item with NO governance fields ⇒ the node
 *     is returned BYTE-IDENTICAL (same reference, in fact). Zero behavioural
 *     change for the un-governed common case.
 *   - VARIANT is intentionally NOT applied here. A raw `insertBuilderNode(kind)`
 *     has no variant (it is `createBuilderNode(kind)`); applying a variant would
 *     change the un-governed baseline. C3 `default_variant` only governs the
 *     gallery insert (which threads it through `createNativeNodeForGalleryItem`).
 *   - This is a DISTINCT path from the gallery's `applyItemOverlayAtInsert`. The
 *     main "+" gallery routes native inserts through `insertBuilderComponent`
 *     (pre-governed node), NOT `insertBuilderNode`, so applying governance inside
 *     the `insertBuilderNode` chokepoint can never stack on the gallery path.
 *
 * Pure (no I/O, no React, no Supabase) so it is unit-testable and importable by
 * the client EditContext chokepoint and any preview.
 */

import type { BuilderNode, BuilderNodeKind } from "@/lib/site-admin/builder-node/types";

import {
  applyItemDataSourceDefaults,
  applyItemDefaultProps,
} from "./apply-item-overlay";
import type { AddGalleryItem } from "./types";

/**
 * The subset of an `AddGalleryItem`'s admin overlay that governs a raw
 * kind-insert. `defaultVariant` is intentionally omitted (see file header — a
 * raw insert has no variant).
 */
export interface KindGovernance {
  lockedProps?: ReadonlyArray<string>;
  defaultProps?: Record<string, unknown> | null;
  dataSourceDefaults?: Record<string, unknown> | null;
}

/** True when a governance overlay actually carries something to apply. */
export function kindGovernanceIsEmpty(g: KindGovernance | null | undefined): boolean {
  if (!g) return true;
  const hasLocks = !!g.lockedProps && g.lockedProps.length > 0;
  const hasDefaults = !!g.defaultProps && Object.keys(g.defaultProps).length > 0;
  const hasBinding =
    !!g.dataSourceDefaults && Object.keys(g.dataSourceDefaults).length > 0;
  return !hasLocks && !hasDefaults && !hasBinding;
}

/**
 * Find the native catalog item that represents the PLAIN insert of `kind` and
 * return its governance overlay — or `null` when no such item exists.
 *
 * Matching rule (PURE, deterministic) — candidates are `insertMethod ===
 * "nativeNode"` with `nativeKind === kind`; the canonical card (the governance
 * counterpart of a plain `createBuilderNode(kind)`) is resolved in priority:
 *   1. a no-variant card (`nativeVariant` absent or `"default"`) — e.g.
 *      `el-text`→paragraph, `el-image`→image, `el-section`→section;
 *   2. else a SELF-NAMED variant card (`nativeVariant === kind`) — e.g.
 *      `el-button` (`nativeKind:"button"`, `nativeVariant:"button"`), since
 *      `button` has no no-variant card;
 *   3. else the `el-<kind>` id convention.
 * No match ⇒ `null`, so a kind whose only cards are true variants (e.g.
 * `cta_group`, only ever the "button-group" variant) is never mis-governed.
 *
 * Returns `null` when no plain item matches, so the caller can short-circuit to
 * the byte-identical raw node.
 */
export function resolveKindGovernance(
  kind: BuilderNodeKind,
  items: ReadonlyArray<AddGalleryItem>,
): KindGovernance | null {
  // Candidates = every native catalog card for this kind. Most kinds have ONE
  // plain (no-variant) card (el-text→paragraph, el-image→image, el-section→
  // section). But some canonical cards carry a SELF-NAMED variant — e.g.
  // `el-button` is `nativeKind:"button"` + `nativeVariant:"button"`, and `button`
  // has NO no-variant card (every button card is a variant). The registry id
  // convention is `el-<kind>`. So resolve the card that a plain
  // `createBuilderNode(kind)` corresponds to, in priority order; no match ⇒ null
  // (ungoverned, byte-identical) so a kind whose only cards are true variants
  // (e.g. a "cta_group" only ever the button-group variant) is never mis-governed.
  const candidates = items.filter(
    (item) => item.insertMethod === "nativeNode" && item.nativeKind === kind,
  );
  const canonical =
    candidates.find(
      (i) => i.nativeVariant === undefined || i.nativeVariant === "default",
    ) ??
    candidates.find((i) => i.nativeVariant === kind) ??
    candidates.find((i) => i.id === `el-${kind}`) ??
    null;
  if (!canonical) return null;
  const governance: KindGovernance = {
    lockedProps: canonical.lockedProps,
    defaultProps: canonical.defaultProps,
    dataSourceDefaults: canonical.dataSourceDefaults,
  };
  return kindGovernanceIsEmpty(governance) ? null : governance;
}

/**
 * Stamp admin-locked prop keys onto a node so a tenant can't edit them. Mirrors
 * the gallery path's private `stampItemLockedProps` but keyed on a governance
 * object rather than a full item. No-op (same reference) without locks.
 */
function stampKindLockedProps(
  node: BuilderNode,
  lockedProps: ReadonlyArray<string> | undefined,
): BuilderNode {
  if (!lockedProps || lockedProps.length === 0) return node;
  const keys = [...lockedProps];
  const props: Record<string, unknown> = {
    ...(node.props as Record<string, unknown>),
    lockedProps: keys,
  };
  return { ...node, lockedProps: keys, props } as unknown as BuilderNode;
}

/**
 * Apply a kind's governance overlay to a freshly-created RAW node, in the SAME
 * order the gallery path uses (defaults → data-source defaults → locks), so a
 * locked prop's first-save baseline is the admin default (closes the same C1
 * residual on the quick-add path). REUSES the gallery helpers — no reinvented
 * merge logic. Returns the node BYTE-IDENTICAL (same reference) when the
 * governance is empty/absent.
 */
export function applyKindGovernanceAtInsert(
  node: BuilderNode,
  governance: KindGovernance | null | undefined,
): BuilderNode {
  if (kindGovernanceIsEmpty(governance)) return node;
  return stampKindLockedProps(
    applyItemDataSourceDefaults(
      applyItemDefaultProps(node, governance!.defaultProps),
      governance!.dataSourceDefaults,
    ),
    governance!.lockedProps,
  );
}

/**
 * Convenience: resolve `kind`'s governance from `items` and apply it to `node`.
 * Byte-identical to `node` when the kind is ungoverned. The single call the
 * `insertBuilderNode` chokepoint makes.
 */
export function governRawInsertNode(
  node: BuilderNode,
  kind: BuilderNodeKind,
  items: ReadonlyArray<AddGalleryItem>,
): BuilderNode {
  return applyKindGovernanceAtInsert(node, resolveKindGovernance(kind, items));
}

/**
 * Builder Studio (WS-C) — find the catalog item that represents a curated
 * `section_embed` / `connectedNode` insert for `sectionTypeKey`, and return its
 * governance overlay (or `null` when none / un-governed).
 *
 * The embed insert paths (`insertBuilderSectionEmbed`) create a node via
 * `createBuilderSectionEmbed(sectionTypeKey)` and DON'T thread the gallery item,
 * so a governed embed card came out un-governed. This resolver is the embed
 * counterpart of `resolveKindGovernance`, keyed on `sectionEmbedKey` rather than
 * `nativeKind`.
 *
 * Matching rule (PURE, deterministic): candidates are items whose
 * `insertMethod` is `"sectionEmbed"` or `"connectedNode"` with
 * `sectionEmbedKey === sectionTypeKey`. When more than one card targets the same
 * key (e.g. a static section card + a connected variant), the FIRST card that
 * actually carries governance wins (so an un-governed sibling never masks a
 * governed one); otherwise the first candidate. No candidate ⇒ `null`.
 *
 * Returns `null` when no embed item matches OR the matched item is un-governed,
 * so the caller short-circuits to the byte-identical raw embed node.
 */
export function resolveSectionEmbedGovernance(
  sectionTypeKey: string,
  items: ReadonlyArray<AddGalleryItem>,
): KindGovernance | null {
  const candidates = items.filter(
    (item) =>
      (item.insertMethod === "sectionEmbed" ||
        item.insertMethod === "connectedNode") &&
      item.sectionEmbedKey === sectionTypeKey,
  );
  if (candidates.length === 0) return null;
  const governanceOf = (item: AddGalleryItem): KindGovernance => ({
    lockedProps: item.lockedProps,
    defaultProps: item.defaultProps,
    dataSourceDefaults: item.dataSourceDefaults,
  });
  const governed = candidates.find(
    (item) => !kindGovernanceIsEmpty(governanceOf(item)),
  );
  if (!governed) return null;
  return governanceOf(governed);
}

/**
 * Convenience: resolve the governance for a curated `section_embed`
 * (`sectionTypeKey`) from `items` and apply it to the freshly-created embed
 * `node`, REUSING the exact same defaults → data-source-defaults → locks helper
 * the gallery + raw-kind paths use (`applyKindGovernanceAtInsert`). Byte-
 * identical to `node` when the embed is un-governed. The single call the
 * `insertBuilderSectionEmbed` chokepoint makes.
 */
export function governSectionEmbedNode(
  node: BuilderNode,
  sectionTypeKey: string,
  items: ReadonlyArray<AddGalleryItem>,
): BuilderNode {
  return applyKindGovernanceAtInsert(
    node,
    resolveSectionEmbedGovernance(sectionTypeKey, items),
  );
}
