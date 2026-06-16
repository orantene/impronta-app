/**
 * apply-item-overlay.ts — Builder Studio (WS-C C2 + C4).
 *
 * Pure, client-safe helpers that apply a catalog component's ADMIN OVERLAY to a
 * freshly-inserted builder node:
 *   - DEFAULT PROPS (`AddGalleryItem.defaultProps`, C2): props an admin sets in
 *     the Builder Lab, deep-merged OVER the variant-resolved props at insert.
 *   - DATA-SOURCE DEFAULTS (`AddGalleryItem.dataSourceDefaults`, C4): a binding
 *     overlay (`{ filterQuery?, maxItems?, pinnedIds? }`) deep-merged INTO an
 *     already-connected node's `props.dataBinding` at insert.
 *
 * Merge order at insert (resolveAddGalleryInsertAction):
 *   variant → applyItemDefaultProps → applyItemDataSourceDefaults → stampItemLockedProps
 * so admin defaults are the canonical baseline a tenant edits from, the binding
 * defaults pre-curate the connected query, and locks ride on top of that
 * baseline (a locked prop's first-save value is now the admin default — which
 * closes the C1 first-save residual where a locked prop's baseline was whatever
 * the variant happened to produce).
 *
 * DEEP-MERGE semantics:
 *   - nested plain objects merge key-by-key (override wins on conflicts),
 *   - arrays are REPLACED wholesale (the override array is taken as-is, never
 *     concatenated or index-merged) — admin sets the full list, e.g. nav links,
 *   - scalars / null / undefined on the override replace the base value,
 *   - inputs are never mutated; a new object is returned.
 *
 * Pure (no I/O, no React, no Supabase) so it is unit-testable and importable by
 * both the server insert path and any client preview.
 */

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Deep-merge `override` onto `base`, returning a NEW object. Plain objects merge
 * recursively; arrays and scalars from `override` REPLACE the base value
 * wholesale. Neither input is mutated.
 */
export function deepMergeReplaceArrays(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const key of Object.keys(override)) {
    const ov = override[key];
    const cur = out[key];
    if (isPlainObject(ov) && isPlainObject(cur)) {
      out[key] = deepMergeReplaceArrays(cur, ov);
    } else if (isPlainObject(ov)) {
      // Override is an object but base isn't (or is absent) → clone the override
      // so the returned tree never shares a reference with the defaultProps input.
      out[key] = deepMergeReplaceArrays({}, ov);
    } else if (Array.isArray(ov)) {
      // Arrays are REPLACED, not concatenated — shallow-copy so the result never
      // aliases the override array.
      out[key] = [...ov];
    } else {
      out[key] = ov;
    }
  }
  return out;
}

/**
 * Merge admin `defaultProps` OVER the inserted node's existing props (deep-merge,
 * arrays replaced). No-op (returns the node unchanged) when `defaultProps` is
 * absent or empty. Never mutates the input node.
 */
export function applyItemDefaultProps(
  node: BuilderNode,
  defaultProps: Record<string, unknown> | null | undefined,
): BuilderNode {
  if (!defaultProps || Object.keys(defaultProps).length === 0) return node;
  const currentProps = (node.props as Record<string, unknown> | undefined) ?? {};
  const props = deepMergeReplaceArrays(currentProps, defaultProps);
  return { ...node, props } as unknown as BuilderNode;
}

/**
 * Builder Studio (WS-C C4) — merge admin `dataSourceDefaults`
 * (e.g. `{ filterQuery?, maxItems?, pinnedIds? }`) INTO the inserted node's
 * `props.dataBinding`, so a connected / dbTemplate component lands pre-bound to
 * the admin's curated query. Deep-merge (arrays replaced), so admin values win
 * but any existing binding keys (e.g. `sourceKey`) survive. No-op (node
 * unchanged) when `dataSourceDefaults` is absent/empty OR the node has no
 * `dataBinding` to bind onto (a static node — nothing to do). Never mutates the
 * input node.
 */
export function applyItemDataSourceDefaults(
  node: BuilderNode,
  dataSourceDefaults: Record<string, unknown> | null | undefined,
): BuilderNode {
  if (!dataSourceDefaults || Object.keys(dataSourceDefaults).length === 0) {
    return node;
  }
  const currentProps = (node.props as Record<string, unknown> | undefined) ?? {};
  const currentBinding = currentProps.dataBinding;
  // Only bind onto nodes that already carry a data binding — defaults configure
  // an EXISTING connection, they don't create one on a static node.
  if (!isPlainObject(currentBinding)) return node;
  const dataBinding = deepMergeReplaceArrays(currentBinding, dataSourceDefaults);
  return {
    ...node,
    props: { ...currentProps, dataBinding },
  } as unknown as BuilderNode;
}
