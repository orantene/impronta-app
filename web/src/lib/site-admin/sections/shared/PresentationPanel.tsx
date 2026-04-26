"use client";

/**
 * Shared Presentation editor panel used by every section's Editor.
 *
 * Phase 10 (XS-10) — auto-bound. Renders a select for every key present
 * in PRESENTATION_OPTIONS / PRESENTATION_FIELD_LABELS, so new presentation
 * fields appear in the panel automatically without touching this file.
 *
 * Drops in underneath the section-specific fields. All controls are
 * optional (unset = fall through to theme defaults) so editors stay
 * lightweight for operators who only care about content.
 */

import type { SectionPresentation } from "./presentation";
import {
  PRESENTATION_FIELD_LABELS,
  PRESENTATION_OPTIONS,
} from "./presentation";

const FIELD = "flex flex-col gap-1.5 text-sm";
const LABEL = "text-xs font-medium uppercase tracking-wide text-muted-foreground";
const SELECT =
  "w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm";

type PresentationObj = NonNullable<SectionPresentation>;
type EnumKey = keyof typeof PRESENTATION_OPTIONS & keyof PresentationObj;

const PLACEHOLDER: Partial<Record<EnumKey, string>> = {
  visibility: "(always)",
};

type Props = {
  value: SectionPresentation;
  onChange: (next: SectionPresentation) => void;
  /** Hide the alignment row when a section doesn't support text alignment. */
  hideAlign?: boolean;
};

export function PresentationPanel({ value, onChange, hideAlign }: Props) {
  const v: PresentationObj = value ?? {};
  const patch = (p: Partial<PresentationObj>) => onChange({ ...v, ...p });

  // Drive the field list off PRESENTATION_OPTIONS so adding a new option
  // group + matching label gives every section a control automatically.
  const fields = (Object.keys(PRESENTATION_OPTIONS) as EnumKey[]).filter(
    (k) => !(hideAlign && k === "align"),
  );

  return (
    <details
      className="rounded-md border border-border/60 bg-muted/30 p-3"
      open={false}
    >
      <summary className="cursor-pointer select-none text-sm font-medium">
        Presentation
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          Background, spacing, alignment, visibility
        </span>
      </summary>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        {fields.map((key) => {
          const options = PRESENTATION_OPTIONS[key] as ReadonlyArray<{
            value: string;
            label: string;
          }>;
          const label = PRESENTATION_FIELD_LABELS[key];
          const current = (v[key] as string | undefined) ?? "";
          return (
            <label key={key} className={FIELD}>
              <span className={LABEL}>{label}</span>
              <select
                className={SELECT}
                value={current}
                onChange={(e) => {
                  const next = (e.target.value || undefined) as
                    | PresentationObj[typeof key]
                    | undefined;
                  patch({ [key]: next } as Partial<PresentationObj>);
                }}
              >
                <option value="">{PLACEHOLDER[key] ?? "(theme default)"}</option>
                {options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
    </details>
  );
}
