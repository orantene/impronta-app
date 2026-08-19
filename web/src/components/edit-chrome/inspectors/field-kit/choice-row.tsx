"use client";

/**
 * Inspector FIELD KIT — ChoiceRow. The thin standard for "one of N, text is
 * enough".
 *
 * There is nothing new in this control. It wraps the existing `Segmented`,
 * which is fine, and adds the thing `Segmented` does NOT have: a POLICY.
 *
 * ── WHY A POLICY ──────────────────────────────────────────────────────────
 * `Segmented` has a `fullWidth` mode whose grid is
 * `repeat(auto-fit, minmax(76px, 1fr))`. That was added so an 11-option "Page
 * background" field would stop clipping labels mid-word — a reasonable fix for
 * a bad situation, but it means a segmented control silently becomes a
 * three-row grid when a section hands it too many options. Two of those in one
 * panel, at different option counts, are two visually different controls doing
 * the same job. That is a meaningful share of the audit's "20 patterns".
 *
 * ChoiceRow's rules:
 *   1. HORIZONTAL ONLY. One row, always. `fullWidth` is never passed through,
 *      so the auto-fit grid cannot engage.
 *   2. MAX 5 OPTIONS. Past five, labels in a ~300px column stop being readable
 *      and the control wants to be something else.
 *   3. NEVER A GRID OR LISTBOX. If a field needs more than five choices, it is
 *      not a choice row: use `GlyphTiles` when the choices have a look, or a
 *      `SelectField` when they do not. Widening this component is the wrong
 *      fix, and the policy check exists so that stays a decision rather than a
 *      drift.
 *
 * The check runs at render in development and warns once per offending field.
 * It does NOT throw or refuse to render: a hard failure in an inspector row
 * would take out the whole panel over a styling policy, which is a worse
 * outcome than a wide row plus a loud console message. The negative case is
 * covered by a test, so the rule is enforced in CI rather than only in a
 * console nobody is reading.
 */

import { useEffect, type ReactNode } from "react";

import { Segmented, type SegmentedOption } from "../../kit/segmented";
import { FieldRow } from "./field-row";

/** The hard ceiling. Changing this is a kit-level decision, and a test knows. */
export const CHOICE_ROW_MAX_OPTIONS = 5;

/** Violation texts already reported this session, so a re-render cannot spam. */
const WARNED = new Set<string>();

/**
 * Pure policy check. Returns a human-readable violation, or null when the
 * options are within policy.
 *
 * Pure and exported so the rule is testable without rendering, and so a
 * future lint rule can reuse it.
 */
export function choiceRowPolicyViolation(
  options: ReadonlyArray<{ value: string }>,
  fieldLabel?: string,
): string | null {
  const where = fieldLabel ? ` (field: "${fieldLabel}")` : "";
  if (options.length === 0) {
    return `ChoiceRow${where} was given no options. A choice row with nothing to choose is a bug, not an empty state.`;
  }
  if (options.length > CHOICE_ROW_MAX_OPTIONS) {
    return (
      `ChoiceRow${where} was given ${options.length} options; the limit is ` +
      `${CHOICE_ROW_MAX_OPTIONS}. A choice row is horizontal and must never wrap into a ` +
      `grid or collapse into a listbox. Use GlyphTiles if the choices have a ` +
      `look, or a select if they do not.`
    );
  }
  const seen = new Set<string>();
  for (const option of options) {
    if (seen.has(option.value)) {
      return `ChoiceRow${where} has a duplicate option value "${option.value}"; selection would be ambiguous.`;
    }
    seen.add(option.value);
  }
  return null;
}

export interface ChoiceRowProps<T extends string> {
  label: ReactNode;
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (next: T) => void;
  accessory?: ReactNode;
  hint?: ReactNode;
  /** Forwarded to FieldRow: "tip" (default) hangs the hint off an ⓘ; "inline" keeps it standing. */
  hintPlacement?: "tip" | "inline";
  searchTerms?: string | string[];
  disabled?: boolean;
  /** Label above the control instead of beside it. */
  orientation?: "inline" | "stacked";
  dataControl?: string;
}

export function ChoiceRow<T extends string>({
  label,
  options,
  value,
  onChange,
  accessory,
  hint,
  hintPlacement,
  searchTerms,
  disabled = false,
  orientation = "inline",
  dataControl,
}: ChoiceRowProps<T>) {
  const fieldLabel = typeof label === "string" ? label : undefined;
  // Dev-time policy check. In an effect, not in render: a warning fired during
  // render runs twice under StrictMode and would double every message. Deduped
  // per violation text across the session, so a re-rendering panel does not
  // bury the console it is trying to reach.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const violation = choiceRowPolicyViolation(options, fieldLabel);
    if (!violation || WARNED.has(violation)) return;
    WARNED.add(violation);
    // Developer-facing kit-policy warning, unreachable in production (guarded
    // above). The structured logger is a server module and cannot serve a
    // client-side lint of JSX props, so this is a genuine console case.
    // eslint-disable-next-line no-console
    console.warn(`[field-kit] ${violation}`);
  }, [options, fieldLabel]);

  return (
    <FieldRow
      label={label}
      accessory={accessory}
      hint={hint}
      hintPlacement={hintPlacement}
      searchTerms={searchTerms}
      orientation={orientation}
      disabled={disabled}
      dataControl={dataControl}
    >
      {/* `fullWidth` is deliberately NOT forwarded — it is the auto-fit grid
          mode, and engaging it is the exact drift this component prevents. */}
      <Segmented
        compact
        value={value}
        onChange={onChange}
        options={options}
        style={{ opacity: disabled ? 0.55 : 1, pointerEvents: disabled ? "none" : undefined }}
      />
    </FieldRow>
  );
}
