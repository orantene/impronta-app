/**
 * Inspector FIELD KIT — the SCALE STEPPER's state machine.
 *
 * THE PRODUCT RULE THIS SERVES, in the owner's words: "styling snaps to your
 * token scale, free values live inside clamps." The fast, obvious move has to
 * land on the theme's own scale; an exact number stays reachable, one level
 * down, for the times a design genuinely needs one.
 *
 * `PresetNumberRow` already does that for the fields WIDE enough to carry a
 * chip row plus a numeric input. Four-up boxes (padding top/right/bottom/left,
 * margin top/right/bottom/left) are not: each cell is roughly half the panel,
 * which is why those eight fields shipped as bare number inputs with no scale
 * anywhere near them. A bare number input is an invitation to type 18px, and
 * eighteen is not on anybody's scale.
 *
 * So this is the same idea in the width a cell actually has: one readout
 * between a minus and a plus, walking the SAME renderer scale the chips use.
 *
 * ── THE HARD INVARIANT: NEVER SNAP A SAVED DESIGN ──────────────────────────
 * Tenants have pages full of hand-authored raw lengths. Nothing in this module
 * rewrites one. `scaleStepperView` is a pure read: a value that is not on the
 * scale comes back as `mode: "custom"` carrying its own number, so the control
 * DISPLAYS "18px" rather than lighting the nearest step and pretending. The
 * only functions that produce a new value are `stepScale` — which runs from a
 * click, never from a render — and it is the operator's click that moves an
 * off-scale value onto the scale, which is exactly what they asked for by
 * pressing the button.
 *
 * Pure data + pure functions. No React. Unit-tested in
 * `scale-stepper-state.test.ts`.
 */

import { formatLength } from "../../kit/number-unit";
import { UNSET_FIELD_VALUE, type FieldValue, type NumericValue } from "./preset-state";
import { presetCaption, remToPx, type PresetTable, type PresetValue } from "./preset-values";

/** What the readout is showing. */
export type ScaleStepperMode = "unset" | "step" | "custom";

export interface ScaleStepperView {
  readonly mode: ScaleStepperMode;
  /** The lit step's id (`"m"`), or null when unset/custom. */
  readonly stepId: string | null;
  /** The step's short name (`"M"`), or null when there is no step. */
  readonly label: string | null;
  /**
   * The resolved value the readout prints: a step's real number (`"24"`), or
   * a custom value's own text (`"18px"`). Null when nothing is set.
   */
  readonly caption: string | null;
  /** Index into `scaleSteps(presets)`, or null. */
  readonly index: number | null;
  /** True when minus is a no-op (nothing is set, so there is nothing below). */
  readonly atMin: boolean;
  /** True when plus is a no-op (already the top of the scale). */
  readonly atMax: boolean;
}

/**
 * The steps a stepper walks: every preset that carries a real value. The
 * table's "" / Default entry is not a step — it is the absence of one, and it
 * is reachable by stepping DOWN off the bottom.
 */
export function scaleSteps(presets: PresetTable): readonly PresetValue[] {
  return presets.filter((p) => p.kind !== "unset");
}

/** A step's number in px, or null for a step with no single number. */
function stepPx(preset: PresetValue): number | null {
  return preset.numeric && preset.numeric.unit === "px" ? preset.numeric.value : null;
}

/**
 * A stored custom length in px, or null when it cannot be compared to the
 * scale at all (`%`, `em`, `vw` — none of which have a fixed px value here).
 * Returning null rather than guessing keeps an incomparable value from being
 * ordered against numbers it has no relation to.
 */
function comparablePx(numeric: NumericValue): number | null {
  if (numeric.unit === "px") return numeric.value;
  if (numeric.unit === "rem") return remToPx(numeric.value);
  return null;
}

/**
 * What the control draws, derived from what the field holds. A pure read: it
 * never returns a value to store, so mounting a panel over a raw design cannot
 * rewrite it.
 */
export function scaleStepperView(
  presets: PresetTable,
  value: FieldValue,
): ScaleStepperView {
  const steps = scaleSteps(presets);

  if (value.kind === "custom") {
    return {
      mode: "custom",
      stepId: null,
      label: null,
      caption: formatLength(value.numeric),
      index: null,
      atMin: false,
      atMax: false,
    };
  }

  if (value.kind === "preset") {
    const index = steps.findIndex((s) => s.id === value.id);
    // An id no scale owns (a step retired since the page was saved) reads as
    // unset here, which is honest: we know nothing about it, so we claim
    // nothing. The value itself is untouched until the operator acts.
    if (index >= 0) {
      const step = steps[index]!;
      return {
        mode: "step",
        stepId: step.id,
        label: step.label,
        caption: presetCaption(step),
        index,
        atMin: false,
        atMax: index === steps.length - 1,
      };
    }
  }

  return {
    mode: "unset",
    stepId: null,
    label: null,
    caption: null,
    index: null,
    atMin: true,
    atMax: steps.length === 0,
  };
}

function atStep(step: PresetValue): FieldValue {
  return { kind: "preset", id: step.id };
}

/**
 * One press of minus / plus. Returns the value to store — called from a click
 * handler, never from a render.
 *
 * The walk, stated once so the control and its test agree:
 *   unset   + up   → the first step. + down → still unset (nothing below).
 *   step    + up   → the next step, stopping at the top.
 *           + down → the previous step; below the first step is UNSET, which
 *                    is how an operator clears the field without hunting for
 *                    a delete affordance.
 *   custom  + up   → the first step ABOVE the stored number.
 *           + down → the first step BELOW it (or unset when it is under the
 *                    whole scale). This is the one moment an off-scale value
 *                    joins the scale, and it happens because the operator
 *                    pressed a button asking for exactly that.
 *   custom in a unit the scale cannot be compared to (`%`, `em`) → up lands on
 *   the first step, down clears. Guessing an ordering between 40% and 24px
 *   would be arithmetic nobody can check.
 */
export function stepScale(
  presets: PresetTable,
  value: FieldValue,
  direction: 1 | -1,
): FieldValue {
  const steps = scaleSteps(presets);
  if (steps.length === 0) return value;
  const first = steps[0]!;
  const last = steps[steps.length - 1]!;

  if (value.kind === "custom") {
    const px = comparablePx(value.numeric);
    if (px === null) return direction > 0 ? atStep(first) : UNSET_FIELD_VALUE;
    if (direction > 0) {
      const above = steps.find((s) => {
        const n = stepPx(s);
        return n !== null && n > px;
      });
      return atStep(above ?? last);
    }
    const below = [...steps].reverse().find((s) => {
      const n = stepPx(s);
      return n !== null && n < px;
    });
    return below ? atStep(below) : UNSET_FIELD_VALUE;
  }

  const view = scaleStepperView(presets, value);
  if (view.mode === "unset" || view.index === null) {
    return direction > 0 ? atStep(first) : UNSET_FIELD_VALUE;
  }

  const next = view.index + direction;
  if (next < 0) return UNSET_FIELD_VALUE;
  if (next > steps.length - 1) return atStep(last);
  return atStep(steps[next]!);
}
