/**
 * Shared responsive field utilities extracted from responsive-panel.
 */

import {
  breakpointLabelForDevice,
  editableOverrideTierIds,
  isBaseBreakpoint,
} from "../breakpoint-registry";
import type { ViewportDevice } from "./responsive-field-state";

export function responsiveFieldLabel(device: ViewportDevice): string {
  return breakpointLabelForDevice(device);
}

/** Build a deep patch clearing one field from a breakpoint bucket. */
export function clearBreakpointFieldPatch(
  device: "tablet" | "mobile",
  field: string,
): Record<string, unknown> {
  return {
    breakpoints: {
      [device]: { [field]: undefined },
    },
  };
}

/** Build a deep patch clearing all keys from a breakpoint bucket. */
export function clearBreakpointBucketPatch(
  device: "tablet" | "mobile",
  bucket: Record<string, unknown>,
): Record<string, unknown> {
  return {
    breakpoints: {
      [device]: Object.fromEntries(Object.keys(bucket).map((k) => [k, undefined])),
    },
  };
}

/** Quick-fix visibility override to visible for diagnostics. */
export function visibilityQuickFixPatch(
  device: "tablet" | "mobile",
): Record<string, unknown> {
  return {
    breakpoints: {
      [device]: { visibility: "always" },
    },
  };
}

export function isEditingOverrideDevice(device: ViewportDevice): boolean {
  return !isBaseBreakpoint(device) && editableOverrideTierIds().includes(device);
}
