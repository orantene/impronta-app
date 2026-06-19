/**
 * component-usage-scan.ts — D1 pure component-TYPE usage tally.
 *
 * For the Builder Lab Catalog "Used N" column we need, per component TYPE
 * (`BuilderNode.kind`), how many tenant trees reference it. The counts are
 * aggregated across every tenant tree-bearing column:
 *
 *   - `cms_pages.blocks`                     (freeform page builderTree)
 *   - `cms_sections.props_jsonb`             (saved section)
 *   - `cms_builder_components.subtree_jsonb` (reusable component subtree)
 *   - `talent_sites.*_snapshot` / `shell_tree` (Max-site pages + shell)
 *
 * The recursive visitor mirrors `computeDataBindingRequirements` /
 * `scanTemplatesForComponentDependents` (depth-first, keys on the `kind`
 * discriminant). It is DELIBERATELY more permissive about the container shape:
 * the four source columns hold heterogeneous JSON (a bare `BuilderNode[]`, a
 * `{ tree: [...] }` envelope, a section's `props_jsonb`, a snapshot object), so
 * the walker descends through arbitrary objects/arrays and tallies every object
 * carrying a string `kind`. This means a tally is correct regardless of where in
 * the JSON the nodes live — exactly the robustness the cross-table aggregate
 * needs, where a single typed walker over `BuilderNode[]` would miss
 * wrapped/nested trees.
 *
 * Pure: no I/O, no DB, no throwing. The server action loads the rows and feeds
 * each column's JSON in; the UI reads the merged tally to render "Used N".
 */

import type { AddGalleryItem } from "./types";

// ── Public types ──────────────────────────────────────────────────────────────

/**
 * The per-TYPE usage tally. `byKind` counts each `BuilderNode.kind` discriminant
 * across all scanned trees; `bySectionEmbedKey` separately counts the curated
 * `section_embed` `props.sectionTypeKey` (so a section-embed catalog item, which
 * is identified by its key rather than a native kind, resolves a count too).
 */
export interface ComponentUsageTally {
  byKind: Record<string, number>;
  bySectionEmbedKey: Record<string, number>;
}

/** An empty tally (identity for {@link mergeUsageTallies}). */
export function emptyUsageTally(): ComponentUsageTally {
  return { byKind: {}, bySectionEmbedKey: {} };
}

// ── JSON walk (defensive — descends arbitrary objects/arrays) ─────────────────

/** Read `kind` off a plain object node when it is a non-empty string, else null. */
function kindOf(value: Record<string, unknown>): string | null {
  const kind = value.kind;
  return typeof kind === "string" && kind.length > 0 ? kind : null;
}

/** Read a `section_embed`'s curated `props.sectionTypeKey` (else null). */
function sectionEmbedKeyOf(value: Record<string, unknown>): string | null {
  if (value.kind !== "section_embed") return null;
  const props = value.props;
  if (props === null || typeof props !== "object") return null;
  const key = (props as { sectionTypeKey?: unknown }).sectionTypeKey;
  return typeof key === "string" && key.length > 0 ? key : null;
}

/**
 * Walk an arbitrary JSON value, tallying every object that carries a string
 * `kind` into `tally.byKind` (and curated section-embed keys into
 * `bySectionEmbedKey`). Descends into EVERY object value and array element, so a
 * bare node array, a `{ tree: [...] }` envelope, a section's `props_jsonb`, or a
 * full snapshot object are all walked correctly. Mutates `tally` in place.
 */
function walkInto(value: unknown, tally: ComponentUsageTally): void {
  if (Array.isArray(value)) {
    for (const el of value) walkInto(el, tally);
    return;
  }
  if (value === null || typeof value !== "object") return;

  const obj = value as Record<string, unknown>;
  const kind = kindOf(obj);
  if (kind !== null) {
    tally.byKind[kind] = (tally.byKind[kind] ?? 0) + 1;
    const embedKey = sectionEmbedKeyOf(obj);
    if (embedKey !== null) {
      tally.bySectionEmbedKey[embedKey] =
        (tally.bySectionEmbedKey[embedKey] ?? 0) + 1;
    }
  }

  // Descend every value (children, props, snapshot sub-objects, …). The kind
  // tally above is independent of where the node sits, so re-walking a node's
  // own `props` is harmless — props are never themselves `kind`-bearing nodes
  // unless they legitimately embed a subtree, which we DO want counted.
  for (const key of Object.keys(obj)) walkInto(obj[key], tally);
}

/**
 * Tally node kinds (and section-embed keys) in ONE source column's JSON value.
 * The column may be a bare node array, an envelope object, or null — all handled.
 */
export function tallyTreeJson(json: unknown): ComponentUsageTally {
  const tally = emptyUsageTally();
  walkInto(json, tally);
  return tally;
}

// ── Merge per-source tallies ──────────────────────────────────────────────────

/** Add `src` into `dst` (mutates `dst`). */
function addInto(dst: Record<string, number>, src: Record<string, number>): void {
  for (const key of Object.keys(src)) {
    dst[key] = (dst[key] ?? 0) + src[key];
  }
}

/**
 * Sum any number of per-source tallies into a single aggregate tally. Pure —
 * returns a fresh tally, never mutates the inputs. Identity over an empty list.
 */
export function mergeUsageTallies(
  ...tallies: ReadonlyArray<ComponentUsageTally>
): ComponentUsageTally {
  const out = emptyUsageTally();
  for (const t of tallies) {
    addInto(out.byKind, t.byKind);
    addInto(out.bySectionEmbedKey, t.bySectionEmbedKey);
  }
  return out;
}

// ── Fold SECURITY-DEFINER RPC rows into a tally (P3) ──────────────────────────

/** One `(kind, n)` row from `count_builder_component_usage()`. */
export interface UsageByKindRow {
  kind: string;
  /** PostgREST returns `bigint` as either a number or a numeric STRING; the
   *  coercion below tolerates both. */
  n: number | string;
}

/** One `(embed_key, n)` row from `count_builder_component_section_embed_keys()`. */
export interface UsageByEmbedKeyRow {
  embed_key: string;
  n: number | string;
}

/** Coerce a PostgREST bigint (number or numeric string) to a finite number; a
 *  non-numeric / NaN value folds to 0 so a bad row can never NaN-poison a tally. */
function coerceCount(n: number | string): number {
  const num = typeof n === "string" ? Number(n) : n;
  return Number.isFinite(num) ? num : 0;
}

/**
 * Fold the two SECURITY-DEFINER usage RPCs' rows into a {@link ComponentUsageTally}
 * (PURE — no DB, no I/O). The server side has already done the recursive-descent
 * walk + group-by, so this just maps `(kind,n)` → `byKind` and `(embed_key,n)` →
 * `bySectionEmbedKey`, coercing bigint-as-string to a number. Repeated keys (which
 * a correct group-by never emits, but a defensive fold should still survive) are
 * summed; empty inputs → an empty tally.
 */
export function tallyFromRpcRows(
  byKindRows: ReadonlyArray<UsageByKindRow> | null | undefined,
  byEmbedRows: ReadonlyArray<UsageByEmbedKeyRow> | null | undefined,
): ComponentUsageTally {
  const tally = emptyUsageTally();
  for (const row of byKindRows ?? []) {
    if (!row.kind) continue;
    tally.byKind[row.kind] = (tally.byKind[row.kind] ?? 0) + coerceCount(row.n);
  }
  for (const row of byEmbedRows ?? []) {
    if (!row.embed_key) continue;
    tally.bySectionEmbedKey[row.embed_key] =
      (tally.bySectionEmbedKey[row.embed_key] ?? 0) + coerceCount(row.n);
  }
  return tally;
}

// ── Resolve a catalog item's usage count ──────────────────────────────────────

/**
 * The usage count for a single gallery item, or `undefined` when the item has no
 * single component TYPE to count (a DB page-template / section-template item is
 * inlined as a whole subtree, not a single node kind — see dependency-scan's note
 * on db-templates). Resolution order:
 *
 *   1. A native element item resolves on its `nativeKind` (= a `BuilderNode.kind`).
 *   2. A curated `section_embed` item resolves on its `sectionEmbedKey`.
 *
 * Returns a NUMBER (0 when the type is real but unused) so the UI can distinguish
 * "used on 0 pages" from "not a countable type" (undefined → "—").
 */
export function usageCountForItem(
  item: Pick<AddGalleryItem, "nativeKind" | "sectionEmbedKey">,
  tally: ComponentUsageTally,
): number | undefined {
  if (item.nativeKind) {
    return tally.byKind[item.nativeKind] ?? 0;
  }
  if (item.sectionEmbedKey) {
    return tally.bySectionEmbedKey[item.sectionEmbedKey] ?? 0;
  }
  return undefined;
}
