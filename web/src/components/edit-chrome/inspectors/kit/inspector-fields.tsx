"use client";

/**
 * Inspector FIELD PRIMITIVES — label + control + hint scaffolds.
 *
 * The bespoke style/layout inspectors repeated the same
 * `div.flex.flex-col.gap-1.5 > span.label > control` scaffold ~150 times,
 * once per Segmented / NumberUnit / native-select field. Each copy carried
 * the same two failure modes: the label class drifting off the kit token, and
 * the optional "responsive override badge" header row being hand-rolled
 * slightly differently at every site.
 *
 * These primitives collapse that scaffold to one place. The rendered DOM is
 * byte-for-byte identical to the hand-rolled version so the sweep is
 * behavior-preserving:
 *   - no accessory  →  `<span class=label>`  then the control
 *   - with accessory →  `<div class="flex items-center justify-between gap-2">`
 *                        wrapping the label + accessory, then the control
 *   - a trailing `hint` renders `<span class=help>` after the control
 *   - `dataControl` maps to the `data-builder-node-style-control` attribute
 *     (omitted entirely when undefined, matching React's attribute elision).
 *
 * `accessory` is intentionally distinguished from `undefined`: passing
 * `accessory={cond ? <Badge/> : null}` opts the field into the header-row
 * layout even while the badge itself is null, exactly as the original
 * conditional-badge scaffolds did.
 */

import type { ReactNode } from "react";

import {
  INSPECTOR_FIELD_LABEL_CLASS,
  INSPECTOR_HELP_TEXT_CLASS,
} from "./inspector-ui";
import { Segmented, type SegmentedOption } from "../../kit/segmented";
import { NumberUnit, type NumberUnitProps } from "../../kit/number-unit";
import { useInspectorT } from "./use-inspector-t";
import { KIT } from "./tokens";

interface FieldShellProps {
  label: ReactNode;
  /** Muted helper copy rendered after the control. */
  hint?: ReactNode;
  /**
   * Optional right-aligned header accessory (e.g. a responsive-override
   * badge). Passing this prop — even as `null` — switches the field to the
   * label/accessory header-row layout.
   */
  accessory?: ReactNode;
  /** `data-builder-node-style-control` value; omitted when undefined. */
  dataControl?: string;
  /** `data-node-presentation-control` value; omitted when undefined. */
  dataPresentationControl?: string;
  /** Override the outer wrapper class (defaults to the gap-1.5 column). */
  className?: string;
  children: ReactNode;
}

const FIELD_COLUMN_CLASS = "flex flex-col gap-1.5";

/**
 * Bare label + control + hint column. Prefer the typed field primitives
 * below; use this directly only for one-off controls with no primitive.
 */
export function InspectorFieldShell({
  label,
  hint,
  accessory,
  dataControl,
  dataPresentationControl,
  className,
  children,
}: FieldShellProps) {
  // WAVE 4.4 translation boundary: every deep-inspector field label and hint
  // arrives here as a plain string, so translating once here covers all of
  // them. Non-string nodes (badges, fragments) pass through unchanged.
  const { tn } = useInspectorT();
  return (
    <div
      className={className ?? FIELD_COLUMN_CLASS}
      data-builder-node-style-control={dataControl}
      data-node-presentation-control={dataPresentationControl}
    >
      {accessory !== undefined ? (
        <div className="flex items-center justify-between gap-2">
          <span className={INSPECTOR_FIELD_LABEL_CLASS}>{tn(label)}</span>
          {accessory}
        </div>
      ) : (
        <span className={INSPECTOR_FIELD_LABEL_CLASS}>{tn(label)}</span>
      )}
      {children}
      {hint !== undefined ? (
        <span className={INSPECTOR_HELP_TEXT_CLASS}>{tn(hint)}</span>
      ) : null}
    </div>
  );
}

type FieldWrapProps = Omit<FieldShellProps, "children">;

interface SegmentedFieldProps<T extends string> extends FieldWrapProps {
  value: T;
  onChange: (next: T) => void;
  options: ReadonlyArray<SegmentedOption<T>>;
  /** Defaults to true (the dominant call shape). */
  fullWidth?: boolean;
  /** Defaults to true. */
  compact?: boolean;
}

/** Label + `<Segmented fullWidth compact>` + optional hint. */
export function SegmentedField<T extends string>({
  label,
  hint,
  accessory,
  dataControl,
  dataPresentationControl,
  className,
  value,
  onChange,
  options,
  fullWidth = true,
  compact = true,
}: SegmentedFieldProps<T>) {
  return (
    <InspectorFieldShell
      label={label}
      hint={hint}
      accessory={accessory}
      dataControl={dataControl}
      dataPresentationControl={dataPresentationControl}
      className={className}
    >
      <Segmented
        fullWidth={fullWidth}
        compact={compact}
        value={value}
        onChange={onChange}
        options={options}
      />
    </InspectorFieldShell>
  );
}

type NumberFieldProps = FieldWrapProps & NumberUnitProps;

/** Label + `<NumberUnit>` + optional hint. */
export function NumberField({
  label,
  hint,
  accessory,
  dataControl,
  dataPresentationControl,
  className,
  ...numberUnit
}: NumberFieldProps) {
  return (
    <InspectorFieldShell
      label={label}
      hint={hint}
      accessory={accessory}
      dataControl={dataControl}
      dataPresentationControl={dataPresentationControl}
      className={className}
    >
      <NumberUnit {...numberUnit} />
    </InspectorFieldShell>
  );
}

export interface SelectFieldOption {
  value: string;
  label: ReactNode;
}

interface SelectFieldProps extends FieldWrapProps {
  value: string;
  onChange: (next: string) => void;
  options: ReadonlyArray<SelectFieldOption>;
  disabled?: boolean;
}

/** Label + kit-styled native `<select>` + optional hint. */
export function SelectField({
  label,
  hint,
  accessory,
  dataControl,
  dataPresentationControl,
  className,
  value,
  onChange,
  options,
  disabled,
}: SelectFieldProps) {
  const { tn } = useInspectorT();
  return (
    <InspectorFieldShell
      label={label}
      hint={hint}
      accessory={accessory}
      dataControl={dataControl}
      dataPresentationControl={dataPresentationControl}
      className={className}
    >
      <select
        className={KIT.select}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {tn(opt.label)}
          </option>
        ))}
      </select>
    </InspectorFieldShell>
  );
}

interface ColorFieldProps extends FieldWrapProps {
  /** Trigger control (swatch button) that opens the shared color popover. */
  children: ReactNode;
}

/**
 * Label + color-swatch trigger + optional hint. The popover itself is mounted
 * separately (portal); this only owns the labelled trigger row, so callers
 * pass the swatch button as `children`.
 */
export function ColorField({
  label,
  hint,
  accessory,
  dataControl,
  dataPresentationControl,
  className,
  children,
}: ColorFieldProps) {
  return (
    <InspectorFieldShell
      label={label}
      hint={hint}
      accessory={accessory}
      dataControl={dataControl}
      dataPresentationControl={dataPresentationControl}
      className={className}
    >
      {children}
    </InspectorFieldShell>
  );
}
