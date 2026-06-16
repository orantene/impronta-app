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
 * Matching rule (PURE, deterministic):
 *   - candidate items are `insertMethod === "nativeNode"` with `nativeKind === kind`;
 *   - the PLAIN-insert item is the candidate carrying NO `nativeVariant`
 *     (equivalently `nativeVariant === "default"`) — the governance counterpart
 *     of `createBuilderNode(kind)`. Kinds whose every catalog card is a variant
 *     (e.g. `cta_group` only exists as the "button-group" variant card) have NO
 *     plain item, so a bare kind-insert of them is left ungoverned (its variant
 *     cards govern their own gallery inserts).
 *   - when several plain items somehow match (shouldn't happen), the FIRST in
 *     list order wins (stable).
 *
 * Returns `null` when no plain item matches, so the caller can short-circuit to
 * the byte-identical raw node.
 */
export function resolveKindGovernance(
  kind: BuilderNodeKind,
  items: ReadonlyArray<AddGalleryItem>,
): KindGovernance | null {
  const plain = items.find(
    (item) =>
      item.insertMethod === "nativeNode" &&
      item.nativeKind === kind &&
      (item.nativeVariant === undefined || item.nativeVariant === "default"),
  );
  if (!plain) return null;
  const governance: KindGovernance = {
    lockedProps: plain.lockedProps,
    defaultProps: plain.defaultProps,
    dataSourceDefaults: plain.dataSourceDefaults,
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
