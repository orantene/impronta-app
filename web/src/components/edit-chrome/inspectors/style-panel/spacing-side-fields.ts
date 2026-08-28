/**
 * StylePanel — the PER-SIDE spacing fields, as pure wiring.
 *
 * Padding top/right/bottom/left and margin top/right/bottom/left are the eight
 * style keys with no token slot of their own: the renderer's token lives on the
 * AXIS (`paddingY`, `marginTop`), while each side is a free CSS length. That is
 * why they shipped as eight bare number inputs, and why every hand-authored
 * tree in the tenant base is full of `paddingTop: "120px"`.
 *
 * They do not need a new schema to reach the scale. `NODE_SPACING` values are
 * ordinary lengths, so writing `"1.5rem"` into `paddingTop` IS the M step — the
 * same one-slot shape `gap` already uses, and the same bridge
 * (`field-value-bridge.ts`) does the reading and the writing.
 *
 * This module is that wiring, kept out of the component so the two things that
 * can be silently wrong — what the control shows for a value already on the
 * page, and what a step writes — are unit-testable without mounting React.
 */

import { parseStyleTokenRef } from "@/lib/site-admin/builder-node/style-token-bindings";

import { SPACING_PRESETS, type FieldValue, type PresetTable } from "../field-kit";
import { oneSlotFieldValue, oneSlotPatch } from "./field-value-bridge";

/**
 * The scale the per-side steppers walk: the renderer's own `NODE_SPACING`,
 * including `xl`. The axis rows ship without an `xl` chip for width reasons;
 * a stepper has no width problem, so the full scale is reachable here.
 */
export const SPACING_SIDE_PRESETS: PresetTable = SPACING_PRESETS;

export type PaddingSideKey =
  | "paddingTop"
  | "paddingRight"
  | "paddingBottom"
  | "paddingLeft";

export type MarginSideKey =
  | "marginTopFree"
  | "marginRightFree"
  | "marginBottomFree"
  | "marginLeftFree";

export type SpacingSideKey = PaddingSideKey | MarginSideKey;

export interface SpacingSide {
  readonly key: SpacingSideKey;
  /** Short side name. Translated at the control's boundary. */
  readonly label: string;
}

export const PADDING_SIDES: ReadonlyArray<SpacingSide> = [
  { key: "paddingTop", label: "Top" },
  { key: "paddingRight", label: "Right" },
  { key: "paddingBottom", label: "Bottom" },
  { key: "paddingLeft", label: "Left" },
];

export const MARGIN_SIDES: ReadonlyArray<SpacingSide> = [
  { key: "marginTopFree", label: "Top" },
  { key: "marginRightFree", label: "Right" },
  { key: "marginBottomFree", label: "Bottom" },
  { key: "marginLeftFree", label: "Left" },
];

/**
 * What one side's control shows for a stored CSS length.
 *
 * A length that IS a scale step reads back as that step (`"1.5rem"` → `M`); a
 * length that is not reads back as itself (`"18px"` → custom, carrying 18px).
 * Nothing is snapped, and nothing is written: this is a read.
 */
export function spacingSideValue(raw: string | undefined): FieldValue {
  return oneSlotFieldValue(raw, SPACING_SIDE_PRESETS);
}

/** The patch one side writes. A step writes the scale's own CSS, never a px re-rounding. */
export function spacingSidePatch(
  key: SpacingSideKey,
  next: FieldValue,
): Record<string, string | undefined> {
  return { [key]: oneSlotPatch(next, SPACING_SIDE_PRESETS) };
}

/**
 * The theme token a side is bound to, or null. A bound side is not walked by
 * the stepper: the token, not the scale, is the source of that value, and
 * stepping it would quietly detach the binding.
 */
export function spacingSideBoundLabel(raw: string | undefined): string | null {
  return parseStyleTokenRef(raw)?.label ?? null;
}

/**
 * True when at least one of these sides holds a length the scale does not own.
 *
 * The group uses this to open its "Exact values" panel BY DEFAULT over an
 * existing raw design, so the numbers a tenant hand-authored are visible the
 * moment the panel opens instead of hiding behind a step name they never chose.
 */
export function hasOffScaleSide(raws: ReadonlyArray<string | undefined>): boolean {
  return raws.some((raw) => spacingSideValue(raw).kind === "custom");
}
