/**
 * Inspector FIELD KIT — the preset ↔ custom state machine (D9 item 2).
 *
 * OWNER'S AMENDMENT: "Preset = shortcut, never a ceiling." Clicking a chip
 * fills the number; typing any number deselects the chips into an explicit
 * custom state. Both directions, always, in every field that has presets.
 *
 * This lives in a `.ts` module of its own, apart from the component, for one
 * reason: it is the part that can be WRONG in a way a screenshot will not
 * show, so it has to be unit-testable without mounting React.
 *
 * ── THE VALUE MODEL ────────────────────────────────────────────────────────
 * A field with presets has two storage shapes in this codebase, and the panel
 * chooses between them per edit. Spacing is the canonical example: the token
 * scale writes `style.paddingY = "m"`, while an exact value writes
 * `style.paddingYFree = "18px"`. So the row's value is a union, and the row
 * hands the panel back which of the two it wants written. P2 wires each
 * section's two slots; the kit never guesses.
 *
 * ── THE RE-LIGHTING DECISION (documented, as asked) ────────────────────────
 * When a typed number lands exactly on a preset's value, that preset RE-LIGHTS
 * and the value is stored as the TOKEN, not as a free length.
 *
 * Why re-light at all: the chip now displays its value (D9 item 1). If the
 * operator types 24 into a spacing field and the "M / 24" chip stays dark, the
 * row is showing two different truths about one number — a dark chip that
 * reads 24 sitting beside a live input that reads 24. Re-lighting is the only
 * self-consistent option once captions exist.
 *
 * Why store the token rather than "24px": tokens survive things a literal does
 * not. The renderer resolves `m` per breakpoint and can retune the scale; a
 * hard 24px opts that node out forever. Landing exactly on a preset is
 * overwhelmingly a click-adjacent action, not a deliberate "I want 24px and I
 * want it frozen" — and an operator who does want it frozen is one keystroke
 * from 24.5 or from a unit change.
 *
 * The behaviour is switchable per call (`relightOnExactMatch`) for a field
 * where the token and the literal genuinely differ, but the DEFAULT is on and
 * P2 should need a reason to turn it off.
 */

import type { LengthUnit } from "../../kit/number-unit";
import { matchPreset, presetById, type PresetTable, type PresetValue } from "./preset-values";

/** A number + unit, the shape `NumberUnit` speaks. */
export interface NumericValue {
  readonly value: number;
  readonly unit: LengthUnit;
}

/**
 * What the field holds. The panel maps `preset` to its token slot and `custom`
 * to its free-length slot.
 */
export type FieldValue =
  | { readonly kind: "unset" }
  | { readonly kind: "preset"; readonly id: string }
  | { readonly kind: "custom"; readonly numeric: NumericValue };

export const UNSET_FIELD_VALUE: FieldValue = { kind: "unset" };

/**
 * What the ROW RENDERS. Derived from `FieldValue` — never stored, so the
 * display and the storage cannot disagree.
 *
 *   - "unset"  → no chip lit, input empty and showing the theme placeholder
 *   - "preset" → that chip lit, input pre-filled with the preset's number
 *                (or empty when the preset has no single number, e.g. Pill)
 *   - "custom" → NO chip lit, the explicit custom state, input holds the value
 */
export interface RowSelection {
  readonly mode: "unset" | "preset" | "custom";
  /** The lit chip's id, or null. */
  readonly presetId: string | null;
  /** What the exact-value input shows, or null for empty. */
  readonly numeric: NumericValue | null;
}

export interface PresetStateOptions {
  /** See the re-lighting decision above. Defaults to true. */
  readonly relightOnExactMatch?: boolean;
}

/**
 * Derive what the row draws from what the field holds.
 *
 * This is the ONLY place the "is a chip lit?" question is answered. A component
 * that keeps its own `selectedChip` state alongside the value is how a panel
 * ends up showing a lit chip over a contradicting number.
 */
export function rowSelection(
  presets: PresetTable,
  value: FieldValue,
  options: PresetStateOptions = {},
): RowSelection {
  const relight = options.relightOnExactMatch ?? true;

  if (value.kind === "unset") {
    return { mode: "unset", presetId: null, numeric: null };
  }

  if (value.kind === "preset") {
    const preset = presetById(presets, value.id);
    // An id the table doesn't know (a node saved before an option was removed)
    // must not silently render as "nothing selected with an empty input" — that
    // reads as unset and invites an accidental overwrite. Fall back to unset but
    // keep it honest by lighting no chip and showing no number, which is what
    // we actually know.
    if (!preset) return { mode: "unset", presetId: null, numeric: null };
    if (preset.kind === "unset") return { mode: "unset", presetId: null, numeric: null };
    return { mode: "preset", presetId: preset.id, numeric: preset.numeric };
  }

  const hit = relight ? matchPreset(presets, value.numeric) : null;
  if (hit) return { mode: "preset", presetId: hit.id, numeric: hit.numeric };
  return { mode: "custom", presetId: null, numeric: value.numeric };
}

/**
 * A chip was clicked. Returns the value to store.
 *
 * Clicking the "" / default chip clears back to the theme default. Clicking a
 * real chip stores its token — and the row will then show that token's number
 * in the input, which is D9 item 2's "clicking a chip fills the number".
 */
export function applyPreset(presets: PresetTable, presetId: string): FieldValue {
  const preset = presetById(presets, presetId);
  if (!preset || preset.kind === "unset") return UNSET_FIELD_VALUE;
  return { kind: "preset", id: preset.id };
}

/**
 * A number was typed (or scrubbed, or stepped). Returns the value to store.
 *
 * `null` — the operator cleared the input — returns to unset rather than to
 * whatever preset was lit before. Clearing a field means "no opinion", and
 * silently restoring a preset would make the field impossible to actually
 * clear.
 */
export function applyNumber(
  presets: PresetTable,
  numeric: NumericValue | null,
  options: PresetStateOptions = {},
): FieldValue {
  if (!numeric) return UNSET_FIELD_VALUE;
  const relight = options.relightOnExactMatch ?? true;
  const hit = relight ? matchPreset(presets, numeric) : null;
  if (hit) return { kind: "preset", id: hit.id };
  return { kind: "custom", numeric };
}

/**
 * True when the row should show its explicit "custom" affordance — the caption
 * that tells the operator the value is theirs and no preset owns it.
 *
 * D9 calls for an EXPLICIT custom state, not merely the absence of a lit chip:
 * "nothing lit" and "custom" look identical otherwise, and the operator cannot
 * tell whether the field is unset or deliberately theirs.
 */
export function isCustom(selection: RowSelection): boolean {
  return selection.mode === "custom";
}

/**
 * The preset a chip should render, paired with whether it is lit. Convenience
 * for the component so it does not re-derive per chip.
 */
export function chipStates(
  presets: PresetTable,
  selection: RowSelection,
): ReadonlyArray<{ preset: PresetValue; selected: boolean }> {
  return presets.map((preset) => ({
    preset,
    selected:
      selection.presetId !== null
        ? preset.id === selection.presetId
        : selection.mode === "unset" && preset.kind === "unset",
  }));
}
