"use client";

/**
 * Layout tab - the per-field label for a node layout control.
 *
 * Shows a "modified on this tier" dot + a reset-to-inherited control when the
 * field carries an override on the active breakpoint, mirroring the section
 * level override badge pattern so per-breakpoint node editing reads as first
 * class and confident.
 *
 * Extracted from `layout-panel.tsx` unchanged: the container editor moved out
 * in the stack-first pass and the carousel branch stayed behind, so the label
 * they share needs a home neither of them owns.
 */

import { CHROME } from "../../kit/tokens";
import { INSPECTOR_FIELD_LABEL_CLASS as FIELD_LABEL } from "../kit/inspector-ui";

export function ContainerFieldLabel({
  label,
  modified,
  onReset,
}: {
  label: string;
  modified: boolean;
  onReset: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-1.5">
      <span className={`${FIELD_LABEL} flex items-center gap-1`}>
        {label}
        {modified ? (
          <span
            aria-hidden
            data-builder-field-modified=""
            title="Overridden on this breakpoint"
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: CHROME.amber }}
          />
        ) : null}
      </span>
      {modified ? (
        <button
          type="button"
          data-builder-field-reset=""
          onClick={onReset}
          className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.08em]"
          style={{ background: "transparent", border: "none", color: CHROME.muted, padding: 0 }}
          title="Reset to desktop value"
        >
          Reset
        </button>
      ) : null}
    </div>
  );
}
