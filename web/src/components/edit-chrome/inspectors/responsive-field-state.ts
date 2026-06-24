/**
 * Shared helpers for per-device override detection (inspector override badges).
 */

import type { BuilderNodeStyle } from "@/lib/site-admin/builder-node";
import {
  baseBreakpointId,
  editableOverrideTierIds,
  isBaseBreakpoint,
} from "../breakpoint-registry";

/**
 * The active inspector viewport tier. Registry-driven (RESP-1): a `string` keyed
 * off the breakpoint registry rather than a fixed literal union, so widening the
 * registry's editable tiers (wide/compact) requires no change here. `"desktop"`
 * (the base tier id) means "edit the default — no override bucket".
 */
export type ViewportDevice = string;

/**
 * A non-base override tier id (the bucket key under `breakpoints[...]` /
 * `responsive[...]`). Registry-driven; backward-compatible with the saved
 * `tablet`/`mobile` buckets, which remain the only render-backed tiers today.
 */
export type OverrideDevice = string;

export function getPresentationFieldForDevice(
  presentation: Record<string, unknown>,
  device: ViewportDevice,
  field: string,
): string | undefined {
  if (isBaseBreakpoint(device)) {
    const v = presentation[field];
    return typeof v === "string" ? v : undefined;
  }
  const bp = presentation.breakpoints as
    | Record<string, Record<string, unknown>>
    | undefined;
  const bucket = bp?.[device]?.[field];
  return typeof bucket === "string" ? bucket : undefined;
}

export function getPresentationOverrideDevice(
  presentation: Record<string, unknown>,
  field: string,
): OverrideDevice | null {
  const bp = presentation.breakpoints as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (!bp) return null;
  for (const device of editableOverrideTierIds()) {
    const bucket = bp[device];
    if (bucket && bucket[field] !== undefined && bucket[field] !== null) {
      return device;
    }
  }
  return null;
}

export function countPresentationOverrides(
  presentation: Record<string, unknown>,
  device: OverrideDevice,
): number {
  const bp = presentation.breakpoints as
    | Record<string, Record<string, unknown>>
    | undefined;
  const bucket = bp?.[device];
  if (!bucket) return 0;
  return Object.keys(bucket).filter(
    (k) => bucket[k] !== undefined && bucket[k] !== null,
  ).length;
}

export function getStyleOverrideDevice(
  style: BuilderNodeStyle | undefined,
  field: string,
): OverrideDevice | null {
  const responsive = style?.responsive;
  if (!responsive) return null;
  for (const device of editableOverrideTierIds()) {
    const bucket = (responsive as Record<string, unknown>)[device] as
      | Record<string, unknown>
      | undefined;
    if (bucket && bucket[field] !== undefined && bucket[field] !== null) {
      return device;
    }
  }
  return null;
}

export function countStyleOverrides(
  style: BuilderNodeStyle | undefined,
  device: OverrideDevice,
): number {
  const bucket = (style?.responsive as Record<string, unknown> | undefined)?.[
    device
  ] as Record<string, unknown> | undefined;
  if (!bucket) return 0;
  return Object.keys(bucket).filter(
    (k) => bucket[k] !== undefined && bucket[k] !== null,
  ).length;
}

export function getNodePresentationOverrideDevice(
  nodePresentation: Record<string, unknown> | undefined,
  field: string,
): OverrideDevice | null {
  if (!nodePresentation) return null;
  const bp = nodePresentation.breakpoints as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (!bp) return null;
  for (const device of editableOverrideTierIds()) {
    const bucket = bp[device];
    if (bucket && bucket[field] !== undefined && bucket[field] !== null) {
      return device;
    }
  }
  return null;
}

/** Merge presentation/style patches for the active viewport device. */
export function patchFieldForDevice(
  device: ViewportDevice,
  field: string,
  value: unknown,
): Record<string, unknown> {
  if (isBaseBreakpoint(device)) {
    return { [field]: value ?? undefined };
  }
  return {
    breakpoints: {
      [device]: { [field]: value ?? undefined },
    },
  };
}

/**
 * Build a SAFE presentation patch that sets (or, with an empty value, clears)
 * `field` for `device`, RECONSTRUCTING the full `breakpoints` map so a *shallow*
 * `onPresentationPatch` merge never stomps sibling buckets or sibling fields
 * (unlike `patchFieldForDevice`, which only fits a deep-merge caller). Base
 * device → writes the top-level field. Clearing prunes the field, then the
 * bucket, then the whole map when emptied. Pure — covered by
 * responsive-field-state.test.ts.
 */
export function buildPresentationFieldPatch(
  presentation: Record<string, unknown>,
  device: ViewportDevice,
  field: string,
  value: string | undefined,
): Record<string, unknown> {
  const v = value && value.length > 0 ? value : undefined;
  if (isBaseBreakpoint(device)) {
    return { [field]: v };
  }
  const bp: Record<string, Record<string, unknown>> = {
    ...((presentation.breakpoints as
      | Record<string, Record<string, unknown>>
      | undefined) ?? {}),
  };
  const bucket = { ...(bp[device] ?? {}) };
  if (v === undefined) delete bucket[field];
  else bucket[field] = v;
  if (Object.keys(bucket).length === 0) delete bp[device];
  else bp[device] = bucket;
  return { breakpoints: Object.keys(bp).length > 0 ? bp : undefined };
}

/** Merge node style patches for the active viewport device. */
export function patchStyleFieldForDevice(
  device: ViewportDevice,
  field: string,
  value: unknown,
): { style: Record<string, unknown> } {
  if (isBaseBreakpoint(device)) {
    return { style: { [field]: value ?? undefined } };
  }
  return {
    style: {
      responsive: {
        [device]: { [field]: value ?? undefined },
      },
    },
  };
}

/** Re-export the base tier id so consumers needn't import the registry too. */
export { baseBreakpointId };
