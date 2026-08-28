"use client";

/**
 * Inspector FIELD KIT — ScaleStepper. The token scale, in the width a
 * four-up box actually has.
 *
 * WHY IT EXISTS, and why it is not a second `PresetNumberRow`: a chip row plus
 * a numeric input needs the full panel width. The per-side padding and margin
 * cells get half of it, which is why those eight fields shipped as bare number
 * inputs — the only control in the Style panel with no scale anywhere near it,
 * and therefore the one most likely to receive a hand-typed 18px.
 *
 * This control puts the SAME renderer scale in that space: minus, a readout,
 * plus. The readout is never mysterious — it prints the step's name AND the
 * number it resolves to ("M · 24"), which is the field kit's first hard rule
 * (a chip is not "M", it is "M with 24 under it") in a horizontal shape.
 *
 * A value that is not on the scale is shown AS ITSELF ("18px") with the custom
 * marker beside it. It is never silently re-lit as the nearest step, and it is
 * never rewritten on mount: every decision here is derived by
 * `scale-stepper-state.ts` from the value passed in, and the only writes come
 * from a button press.
 *
 * The exact-value escape is NOT inside this control. It belongs to the group
 * that owns the four sides (see `style-panel/exact-spacing-sides.tsx`), which
 * shows one "Exact values" expander for the whole box instead of four half-
 * width numeric inputs squeezed under four steppers.
 */

import { useId } from "react";

import { useInspectorT } from "../kit/use-inspector-t";
import type { FieldValue } from "./preset-state";
import type { PresetTable } from "./preset-values";
import { scaleStepperView, stepScale } from "./scale-stepper-state";
import { FIELD_KIT } from "./tokens";

export interface ScaleStepperProps {
  /** The side/field name shown above the control. */
  label: string;
  /** The scale to walk. Use a `preset-values` table. */
  presets: PresetTable;
  /** What the field currently holds. */
  value: FieldValue;
  /** Called with the value to store. Only ever from a button press. */
  onChange: (next: FieldValue) => void;
  /** Readout text when nothing is set. */
  placeholder?: string;
  /**
   * Set when the slot is bound to a theme token. The stepper then reports the
   * binding instead of an empty readout, and does not offer to walk a scale it
   * is not the source of.
   */
  boundLabel?: string | null;
  disabled?: boolean;
  /** `data-builder-node-style-control` hook for QA + e2e. */
  dataControl?: string;
}

const BUTTON_WIDTH = 24;

export function ScaleStepper({
  label,
  presets,
  value,
  onChange,
  placeholder = "Auto",
  boundLabel = null,
  disabled = false,
  dataControl,
}: ScaleStepperProps) {
  const { t } = useInspectorT();
  const labelId = useId();
  const view = scaleStepperView(presets, value);
  const inert = disabled || Boolean(boundLabel);

  const readout = boundLabel
    ? t(boundLabel)
    : view.mode === "unset"
      ? t(placeholder)
      : view.mode === "step"
        ? `${t(view.label ?? "")}${view.caption ? ` · ${view.caption}` : ""}`
        : (view.caption ?? "");

  function press(direction: 1 | -1) {
    if (inert) return;
    onChange(stepScale(presets, value, direction));
  }

  const buttonStyle = (blocked: boolean) => ({
    width: BUTTON_WIDTH,
    flex: "0 0 auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "transparent",
    border: "none",
    padding: 0,
    fontSize: FIELD_KIT.font.value,
    fontWeight: FIELD_KIT.weight.label,
    lineHeight: 1,
    color: blocked ? FIELD_KIT.mutedSoft : FIELD_KIT.muted,
    cursor: blocked ? "default" : "pointer",
  });

  return (
    <div className="flex flex-col gap-1" style={{ minWidth: 0 }}>
      <span
        id={labelId}
        style={{
          fontSize: FIELD_KIT.font.caption,
          fontWeight: FIELD_KIT.weight.caption,
          color: FIELD_KIT.muted,
        }}
      >
        {t(label)}
      </span>
      <div
        role="group"
        aria-labelledby={labelId}
        data-builder-node-style-control={dataControl}
        data-field-kit-scale-stepper=""
        data-scale-mode={boundLabel ? "bound" : view.mode}
        style={{
          display: "flex",
          alignItems: "center",
          minWidth: 0,
          height: FIELD_KIT.size.control,
          borderRadius: FIELD_KIT.radius.chip,
          border: `1px solid ${FIELD_KIT.border}`,
          background: inert ? FIELD_KIT.surfaceRecessed : FIELD_KIT.surface,
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <button
          type="button"
          aria-label={t("Smaller")}
          disabled={inert || view.atMin}
          onClick={() => press(-1)}
          style={buttonStyle(inert || view.atMin)}
        >
          &minus;
        </button>
        <span
          data-field-kit-scale-readout=""
          title={readout}
          style={{
            flex: "1 1 auto",
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            textAlign: "center",
            fontSize: FIELD_KIT.font.value,
            fontVariantNumeric: "tabular-nums",
            color:
              view.mode === "unset" && !boundLabel
                ? FIELD_KIT.mutedSoft
                : view.mode === "custom"
                  ? FIELD_KIT.accent
                  : FIELD_KIT.ink,
          }}
        >
          {readout}
        </span>
        <button
          type="button"
          aria-label={t("Larger")}
          disabled={inert || view.atMax}
          onClick={() => press(1)}
          style={buttonStyle(inert || view.atMax)}
        >
          +
        </button>
      </div>
    </div>
  );
}
