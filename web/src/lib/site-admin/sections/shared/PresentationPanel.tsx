"use client";

/**
 * Shared Presentation editor panel used by every section's Editor.
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

type Props = {
  value: SectionPresentation;
  onChange: (next: SectionPresentation) => void;
  /** Hide the alignment row when a section doesn't support text alignment. */
  hideAlign?: boolean;
};

export function PresentationPanel({ value, onChange, hideAlign }: Props) {
  const v: PresentationObj = value ?? {};
  const patch = (p: Partial<PresentationObj>) => onChange({ ...v, ...p });

  /** Generic typed change handler for a single presentation key. */
  function makeHandler<K extends keyof PresentationObj>(key: K) {
    return (e: React.ChangeEvent<HTMLSelectElement>) => {
      const next = (e.target.value || undefined) as PresentationObj[K];
      patch({ [key]: next } as Partial<PresentationObj>);
    };
  }

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
        <label className={FIELD}>
          <span className={LABEL}>{PRESENTATION_FIELD_LABELS.background}</span>
          <select
            className={SELECT}
            value={v.background ?? ""}
            onChange={makeHandler("background")}
          >
            <option value="">(theme default)</option>
            {PRESENTATION_OPTIONS.background.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className={FIELD}>
          <span className={LABEL}>{PRESENTATION_FIELD_LABELS.paddingTop}</span>
          <select
            className={SELECT}
            value={v.paddingTop ?? ""}
            onChange={makeHandler("paddingTop")}
          >
            <option value="">(theme default)</option>
            {PRESENTATION_OPTIONS.paddingTop.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className={FIELD}>
          <span className={LABEL}>
            {PRESENTATION_FIELD_LABELS.paddingBottom}
          </span>
          <select
            className={SELECT}
            value={v.paddingBottom ?? ""}
            onChange={makeHandler("paddingBottom")}
          >
            <option value="">(theme default)</option>
            {PRESENTATION_OPTIONS.paddingBottom.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className={FIELD}>
          <span className={LABEL}>
            {PRESENTATION_FIELD_LABELS.containerWidth}
          </span>
          <select
            className={SELECT}
            value={v.containerWidth ?? ""}
            onChange={makeHandler("containerWidth")}
          >
            <option value="">(theme default)</option>
            {PRESENTATION_OPTIONS.containerWidth.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        {!hideAlign && (
          <label className={FIELD}>
            <span className={LABEL}>{PRESENTATION_FIELD_LABELS.align}</span>
            <select
              className={SELECT}
              value={v.align ?? ""}
              onChange={makeHandler("align")}
            >
              <option value="">(theme default)</option>
              {PRESENTATION_OPTIONS.align.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className={FIELD}>
          <span className={LABEL}>{PRESENTATION_FIELD_LABELS.dividerTop}</span>
          <select
            className={SELECT}
            value={v.dividerTop ?? ""}
            onChange={makeHandler("dividerTop")}
          >
            <option value="">(theme default)</option>
            {PRESENTATION_OPTIONS.dividerTop.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className={FIELD}>
          <span className={LABEL}>
            {PRESENTATION_FIELD_LABELS.mobileStack}
          </span>
          <select
            className={SELECT}
            value={v.mobileStack ?? ""}
            onChange={makeHandler("mobileStack")}
          >
            <option value="">(theme default)</option>
            {PRESENTATION_OPTIONS.mobileStack.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className={FIELD}>
          <span className={LABEL}>{PRESENTATION_FIELD_LABELS.visibility}</span>
          <select
            className={SELECT}
            value={v.visibility ?? ""}
            onChange={makeHandler("visibility")}
          >
            <option value="">(always)</option>
            {PRESENTATION_OPTIONS.visibility.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </details>
  );
}
