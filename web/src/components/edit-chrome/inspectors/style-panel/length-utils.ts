/**
 * StylePanel — CSS length <-> LengthValue adapters (W5-C1 domain split).
 *
 * Extracted verbatim from style-panel.tsx so the domain sub-section
 * components (Dimensions / Spacing / Appearance / …) can share the same
 * length parsing/formatting adapters the parent closure used. Pure
 * functions — no component scope, no side effects — so the move is
 * byte-for-byte behavior-preserving.
 */

import type { LengthValue, LengthUnit } from "../../kit/number-unit";

export function parseCssLength(input?: string): LengthValue | null {
  if (!input) return null;
  const match = /^(-?\d*\.?\d+)(px|rem|em|%|vw|vh)$/.exec(input.trim());
  if (!match) return null;
  const parsed = Number.parseFloat(match[1]);
  if (Number.isNaN(parsed)) return null;
  return { value: parsed, unit: match[2] as LengthUnit };
}

/**
 * Curated NodePresentation stores plain numbers (px / %), while the NumberUnit
 * control speaks LengthValue. These adapters bridge the two without leaking the
 * unit into storage (the unit is fixed per field).
 */
export function pxLength(value: number | undefined): LengthValue | null {
  return typeof value === "number" && Number.isFinite(value)
    ? { value, unit: "px" }
    : null;
}
export function pctLength(value: number | undefined): LengthValue | null {
  return typeof value === "number" && Number.isFinite(value)
    ? { value, unit: "%" }
    : null;
}
