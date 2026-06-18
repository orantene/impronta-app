/**
 * multi-selection-style.ts — INS-2 (Builder Ecosystem 2026 · Wave 2).
 *
 * Pure resolver for the inspector's multi-node "Mixed" state. Given the N
 * builder nodes the operator has selected and a style FIELD (a top-level
 * `BuilderNodeStyle` key like `textColor` / `borderRadius`, optionally scoped to
 * a responsive bucket), it returns the SHARED value when every node agrees, or a
 * `MIXED` marker when they differ. The inspector renders the common value or a
 * "Mixed" placeholder off this.
 *
 * Companion to the existing multi-node patch chokepoint
 * (`mergeStylePatchIntoTree` in edit-chrome/multi-node-layout.ts, driven by
 * `patchSelectedBuilderNodesStyle` in edit-context.tsx). This module ONLY
 * resolves the read-side (diff) + the lock-aware filter for the write-side; it
 * adds NO parallel mutation system. Edits still fan out through the single
 * `executeBuilderNodeOperation("patch", …)` chokepoint.
 *
 * Shared (not a fork): the resolver is a pure lib consumed by the ONE shared
 * StylePanel / inspector-dock, so all four surfaces (Builder Lab, Admin
 * storefront, Talent Max profile, Talent Max site) inherit Mixed-state at once.
 *
 * Pure + client-safe (no I/O, no React) so the inspector AND a unit test import
 * it directly.
 */

import { isPropLocked } from "./prop-lock";
import type {
  BuilderNodeStyle,
  BuilderNodeStyleValue,
} from "./types";

/**
 * The sentinel returned for a field whose value differs across the selection.
 * A unique symbol so it can never collide with a legitimate string/number value
 * an operator could set.
 */
export const MIXED = Symbol("multi-selection-style:mixed");
export type Mixed = typeof MIXED;

/** A responsive bucket id, or `null`/"base" for the top-level (desktop) style. */
export type MultiSelectionBucket = "tablet" | "mobile" | null;

/**
 * Minimal node shape the resolver needs — a real BuilderNode satisfies it.
 * Section nodes carry no freeform `style`, so they contribute `undefined` for
 * every field (the same as a node that simply hasn't set the field).
 */
export interface MultiSelectionStyleNode {
  id: string;
  kind: string;
  props?: { style?: BuilderNodeStyle | null } | null;
  lockedProps?: readonly string[] | null;
}

/** One field's resolved state across the selection. */
export interface ResolvedMultiSelectionField {
  /** The shared value when every node agrees, else `MIXED`. `undefined` = every node leaves the field unset. */
  readonly value: BuilderNodeStyleValue[keyof BuilderNodeStyleValue] | undefined | Mixed;
  /** True when the nodes disagree (i.e. `value === MIXED`). */
  readonly mixed: boolean;
  /** True when AT LEAST ONE selected node locks this field (INS-1). The inspector disables the control. */
  readonly locked: boolean;
}

/** Convenience guard so callers don't import the symbol just to compare. */
export function isMixed(value: unknown): value is Mixed {
  return value === MIXED;
}

/**
 * Read a node's style value for `field` in the given `bucket`. The base bucket
 * reads the top-level style key; a responsive bucket reads
 * `style.responsive[bucket][field]`. Returns `undefined` when the node (or the
 * bucket) doesn't set the field — including section nodes with no style.
 */
function readStyleField(
  node: MultiSelectionStyleNode,
  field: string,
  bucket: MultiSelectionBucket,
): unknown {
  const style = node.props?.style;
  if (!style) return undefined;
  if (bucket == null) {
    return (style as Record<string, unknown>)[field];
  }
  const responsive = style.responsive;
  const tier = responsive?.[bucket] as Record<string, unknown> | undefined;
  return tier ? tier[field] : undefined;
}

/**
 * The lock dot-path for a style field in a bucket. The base bucket locks as
 * `style.<field>`; a responsive bucket locks as `style.responsive.<bucket>.<field>`.
 * Mirrors the dot-path convention `stripLockedKeysFromPatch` enforces, so the
 * read-side "locked" badge and the write-side strip agree.
 */
export function styleFieldLockPath(
  field: string,
  bucket: MultiSelectionBucket,
): string {
  return bucket == null
    ? `style.${field}`
    : `style.responsive.${bucket}.${field}`;
}

/**
 * Resolve ONE style field across the selection: the shared value or `MIXED`,
 * plus whether any selected node locks it. `undefined` (every node unset) is a
 * legitimate shared value — it is NOT mixed. Only two distinct *defined-or-not*
 * states that disagree → MIXED. Values are compared with `Object.is` after a
 * stable JSON serialization so object-valued fields (rare for scalars, but
 * possible) compare by structure, not reference.
 */
export function resolveMultiSelectionField(
  nodes: ReadonlyArray<MultiSelectionStyleNode>,
  field: string,
  bucket: MultiSelectionBucket = null,
): ResolvedMultiSelectionField {
  const lockPath = styleFieldLockPath(field, bucket);
  let locked = false;
  let first = true;
  let sharedRaw: unknown;
  let sharedKey = "";
  let mixed = false;
  for (const node of nodes) {
    if (isPropLocked(node, lockPath)) locked = true;
    const raw = readStyleField(node, field, bucket);
    const key = comparisonKey(raw);
    if (first) {
      sharedRaw = raw;
      sharedKey = key;
      first = false;
      continue;
    }
    if (!mixed && key !== sharedKey) mixed = true;
  }
  if (mixed) {
    return { value: MIXED, mixed: true, locked };
  }
  return {
    value: sharedRaw as ResolvedMultiSelectionField["value"],
    mixed: false,
    locked,
  };
}

/** Stable key for value comparison — `undefined`/`null` collapse so an unset vs explicit-null field reads as equal. */
function comparisonKey(value: unknown): string {
  if (value === undefined || value === null) return "\0nullish";
  if (typeof value === "object") {
    try {
      return `o:${JSON.stringify(value)}`;
    } catch {
      return "o:[unserializable]";
    }
  }
  return `${typeof value}:${String(value)}`;
}

/**
 * Resolve MANY fields at once — the map the inspector iterates over. The shape
 * matches the plan's `Record<field,{value,mixed}>` contract (extended with the
 * lock flag so INS-1 locks badge in the multi-select panel too).
 */
export function resolveMultiSelectionStyle(
  nodes: ReadonlyArray<MultiSelectionStyleNode>,
  fields: ReadonlyArray<string>,
  bucket: MultiSelectionBucket = null,
): Record<string, ResolvedMultiSelectionField> {
  const out: Record<string, ResolvedMultiSelectionField> = {};
  for (const field of fields) {
    out[field] = resolveMultiSelectionField(nodes, field, bucket);
  }
  return out;
}

/**
 * Per-node lock filter for a BULK style patch. Given the patch the operator
 * committed and ONE selected node, return the subset of patch keys that node
 * does NOT lock (so a bulk edit can never bypass a per-node INS-1 lock). The
 * patch keys are bucket-scoped via `styleFieldLockPath`, matching how
 * `mergeStylePatchIntoTree` will write them.
 *
 * Returns a NEW object; never mutates the input. An empty result means every
 * patched field is locked on this node → the merge skips it entirely.
 */
export function filterBulkStylePatchForNode(
  patch: Readonly<Record<string, unknown>>,
  node: { lockedProps?: readonly string[] | null },
  bucket: MultiSelectionBucket = null,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) {
    if (isPropLocked(node, styleFieldLockPath(key, bucket))) continue;
    out[key] = patch[key];
  }
  return out;
}
