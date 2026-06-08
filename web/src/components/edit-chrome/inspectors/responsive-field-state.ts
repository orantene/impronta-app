/**
 * Shared helpers for per-device override detection (inspector override badges).
 */

import type { BuilderNodeStyle } from "@/lib/site-admin/builder-node";

export type ViewportDevice = "desktop" | "tablet" | "mobile";
export type OverrideDevice = "tablet" | "mobile";

export function getPresentationFieldForDevice(
  presentation: Record<string, unknown>,
  device: ViewportDevice,
  field: string,
): string | undefined {
  if (device === "desktop") {
    const v = presentation[field];
    return typeof v === "string" ? v : undefined;
  }
  const bp = presentation.breakpoints as
    | Partial<Record<OverrideDevice, Record<string, unknown>>>
    | undefined;
  const bucket = bp?.[device]?.[field];
  return typeof bucket === "string" ? bucket : undefined;
}

export function getPresentationOverrideDevice(
  presentation: Record<string, unknown>,
  field: string,
): OverrideDevice | null {
  const bp = presentation.breakpoints as
    | Partial<Record<OverrideDevice, Record<string, unknown>>>
    | undefined;
  if (!bp) return null;
  for (const device of ["tablet", "mobile"] as const) {
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
    | Partial<Record<OverrideDevice, Record<string, unknown>>>
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
  for (const device of ["tablet", "mobile"] as const) {
    const bucket = responsive[device] as Record<string, unknown> | undefined;
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
  const bucket = style?.responsive?.[device] as Record<string, unknown> | undefined;
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
    | Partial<Record<OverrideDevice, Record<string, unknown>>>
    | undefined;
  if (!bp) return null;
  for (const device of ["tablet", "mobile"] as const) {
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
  if (device === "desktop") {
    return { [field]: value ?? undefined };
  }
  return {
    breakpoints: {
      [device]: { [field]: value ?? undefined },
    },
  };
}

/** Merge node style patches for the active viewport device. */
export function patchStyleFieldForDevice(
  device: ViewportDevice,
  field: string,
  value: unknown,
): { style: Record<string, unknown> } {
  if (device === "desktop") {
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
