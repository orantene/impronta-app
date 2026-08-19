"use client";

/**
 * Inspector FIELD KIT — PresetNumberRow. D9 items 1 and 2, in one control.
 *
 * OWNER, verbatim:
 *   1. "A padding chip is not 'M', it is 'M' with '16' under it." Every chip
 *      here carries its real resolved value as a caption, from
 *      `preset-values.ts`, which mirrors the renderer and is guarded against
 *      drift. A chip with no honest value (the theme default) shows no number
 *      rather than a plausible-looking one.
 *   2. "Preset = shortcut, never a ceiling." The exact-value input sits BESIDE
 *      the chips — not behind a "Custom value" disclosure, which is how the
 *      audit found 19 of them hiding. Clicking a chip fills the number; typing
 *      any number deselects the chips into an explicit custom state, announced
 *      in words so "custom" never has to be inferred from "nothing is lit".
 *
 * The numeric input is `kit/number-unit.tsx` (NumberUnit) itself, not a
 * lookalike: the audit named it the best control in the codebase, and it
 * already carries steppers, the unit picker, and drag-to-scrub. Writing a
 * second numeric input is how a kit becomes the 21st pattern instead of the
 * one that replaces 20.
 *
 * All decision logic lives in `preset-state.ts` and is unit-tested there. This
 * file is presentation: it holds NO selection state of its own, because a
 * component that remembers which chip is lit, separately from the value, is
 * exactly how a lit chip ends up contradicting the number beside it.
 */

import { useId, useRef, type ReactNode } from "react";

import { NumberUnit, type LengthUnit } from "../../kit/number-unit";
import { useInspectorT } from "../kit/use-inspector-t";
import { FieldRow } from "./field-row";
import {
  applyNumber,
  applyPreset,
  chipStates,
  rowSelection,
  type FieldValue,
  type PresetStateOptions,
} from "./preset-state";
import { presetCaption, type PresetTable } from "./preset-values";
import { FIELD_KIT } from "./tokens";

export interface PresetNumberRowProps extends PresetStateOptions {
  /** Field name. Plain strings translate at the kit boundary. */
  label: ReactNode;
  /** The preset chips, with their honest values. Use a `preset-values` table. */
  presets: PresetTable;
  /** What the field currently holds. */
  value: FieldValue;
  /** Called with the value to store. Never called with a partial state. */
  onChange: (next: FieldValue) => void;
  /** Units the exact input offers. Defaults to px + rem for spacing-like fields. */
  units?: readonly LengthUnit[];
  /** Stepper delta. */
  step?: number;
  min?: number;
  max?: number;
  /** Shown in the empty input: usually the inherited/theme value. */
  placeholder?: string;
  /** Trailing slot on the label line — override badges, lock badges. */
  accessory?: ReactNode;
  /** One line of plain-language help. */
  hint?: ReactNode;
  /** Forwarded to FieldRow: "tip" (default) hangs the hint off an ⓘ; "inline" keeps it standing. */
  hintPlacement?: "tip" | "inline";
  /** Extra "Find a setting" terms; defaults to the label. */
  searchTerms?: string | string[];
  /** Dim and block the whole row. */
  disabled?: boolean;
  /**
   * Locked by a template/component lock. Same visual as disabled, but the
   * caller supplies the reason via `accessory` (a LockBadge) so the operator
   * learns WHY rather than just meeting a dead control.
   */
  locked?: boolean;
  dataControl?: string;
}

const DEFAULT_UNITS: readonly LengthUnit[] = ["px", "rem", "%"] as const;

export function PresetNumberRow({
  label,
  presets,
  value,
  onChange,
  units = DEFAULT_UNITS,
  step = 1,
  min,
  max,
  placeholder,
  accessory,
  hint,
  hintPlacement,
  searchTerms,
  disabled = false,
  locked = false,
  relightOnExactMatch,
  dataControl,
}: PresetNumberRowProps) {
  const { t } = useInspectorT();
  const labelId = useId();
  const groupRef = useRef<HTMLDivElement | null>(null);

  const options: PresetStateOptions = { relightOnExactMatch };
  const selection = rowSelection(presets, value, options);
  const chips = chipStates(presets, selection);
  const inert = disabled || locked;

  // Roving tabindex. When NOTHING is lit (the custom state) the group would
  // otherwise have no tab stop at all and become keyboard-unreachable, so the
  // first chip takes the stop. This is the standard radiogroup fallback.
  const litIndex = chips.findIndex((c) => c.selected);
  const tabStopIndex = litIndex >= 0 ? litIndex : 0;

  function focusChip(index: number) {
    const buttons =
      groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    buttons?.[index]?.focus();
  }

  return (
    <FieldRow
      label={label}
      accessory={accessory}
      hint={hint}
      hintPlacement={hintPlacement}
      searchTerms={searchTerms}
      orientation="stacked"
      disabled={inert}
      groupLabelId={labelId}
      dataControl={dataControl}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: FIELD_KIT.gap.control,
          flexWrap: "wrap",
          minWidth: 0,
        }}
      >
        <div
          ref={groupRef}
          role="radiogroup"
          aria-labelledby={labelId}
          data-field-kit-presets=""
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: FIELD_KIT.gap.tight,
            flex: "1 1 auto",
            minWidth: 0,
          }}
        >
          {chips.map(({ preset, selected }, index) => {
            const caption = presetCaption(preset);
            return (
              <button
                key={preset.id || "__default"}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={index === tabStopIndex ? 0 : -1}
                disabled={inert}
                // No tooltip. `preset.variantNote` is reviewer prose ("999px is
                // a fully-rounded sentinel"), not operator copy — surfacing it
                // would ship untranslated developer-speak into the panel.
                onClick={() => onChange(applyPreset(presets, preset.id))}
                onKeyDown={(e) => {
                  if (
                    e.key !== "ArrowRight" &&
                    e.key !== "ArrowDown" &&
                    e.key !== "ArrowLeft" &&
                    e.key !== "ArrowUp"
                  )
                    return;
                  e.preventDefault();
                  const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
                  const next = (index + dir + chips.length) % chips.length;
                  onChange(applyPreset(presets, chips[next].preset.id));
                  focusChip(next);
                }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 1,
                  minWidth: 34,
                  minHeight: FIELD_KIT.size.presetChip,
                  padding: "3px 7px",
                  borderRadius: FIELD_KIT.radius.chip,
                  border: `1px solid ${selected ? FIELD_KIT.accent : FIELD_KIT.border}`,
                  background: selected ? FIELD_KIT.accentFill : FIELD_KIT.surface,
                  color: selected ? FIELD_KIT.accent : FIELD_KIT.ink,
                  cursor: inert ? "default" : "pointer",
                  transition: `border-color ${FIELD_KIT.motion.duration}ms ${FIELD_KIT.motion.easing}, background-color ${FIELD_KIT.motion.duration}ms ${FIELD_KIT.motion.easing}`,
                }}
              >
                <span
                  style={{
                    fontSize: FIELD_KIT.font.label,
                    fontWeight: FIELD_KIT.weight.label,
                    lineHeight: 1.1,
                  }}
                >
                  {t(preset.label)}
                </span>
                {/* D9 item 1: the value, right there, under the label. */}
                {caption ? (
                  <span
                    aria-hidden
                    style={{
                      fontSize: FIELD_KIT.font.caption,
                      fontWeight: FIELD_KIT.weight.caption,
                      lineHeight: 1.1,
                      fontVariantNumeric: "tabular-nums",
                      color: selected ? FIELD_KIT.accent : FIELD_KIT.muted,
                    }}
                  >
                    {caption}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* D9 item 2: the exact input, beside the presets, never behind a
            disclosure. NumberUnit is reused verbatim, steppers and all. */}
        <div
          role="group"
          aria-label={t("Exact value")}
          style={{ flex: "0 0 auto" }}
        >
          <NumberUnit
            value={selection.numeric ? { ...selection.numeric } : null}
            onChange={(next) => onChange(applyNumber(presets, next, options))}
            units={units}
            step={step}
            min={min}
            max={max}
            placeholder={placeholder ?? "—"}
            disabled={inert}
            width={112}
          />
        </div>
      </div>

      {/* An EXPLICIT custom state. "No chip is lit" is not a state an operator
          can read; this sentence is. */}
      {selection.mode === "custom" ? (
        <div
          data-field-kit-custom=""
          style={{
            marginTop: FIELD_KIT.gap.tight,
            fontSize: FIELD_KIT.font.caption,
            fontWeight: FIELD_KIT.weight.caption,
            color: FIELD_KIT.accent,
          }}
        >
          {t("Custom value")}
        </div>
      ) : null}
    </FieldRow>
  );
}
