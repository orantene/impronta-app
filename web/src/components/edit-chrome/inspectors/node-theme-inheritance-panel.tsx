"use client";

/**
 * #3b — NodeThemeInheritancePanel.
 *
 * A self-contained inspector sub-component (one insertion point in
 * `style-panel.tsx`) that surfaces, for the selected freeform node, the
 * Figma/Webflow-style per-field Inherit / Override control:
 *
 *   Text color   Inherit · Theme: Ink     [ Inherit | Override ]
 *   Fill         Override                  [ Inherit | Override ]
 *
 * "Inherit" clears the node's literal for that field (→ `undefined`) so the
 * cascade default (component default, else the global theme token) shows
 * through. "Override" seeds the resolved value as a starting literal so the
 * operator edits from what they were already seeing, then tunes it in the
 * existing color/size/etc rows below.
 *
 * The panel is READ-ONLY-FIRST: it shows the resolved source even when every
 * field is already overridden, so the operator can always see what the theme
 * would give them and snap back to it in one click.
 *
 * All writes route OUT through the two callbacks — the parent wires them to the
 * SAME `patchSelectedStandaloneStyle` chain every other node-style row uses, so
 * inherit/override participate in undo/redo + autosave with zero new write path.
 */
import { CHROME } from "../kit/tokens";
import { Segmented } from "../kit/segmented";
import { INSPECTOR_FIELD_LABEL_CLASS as FIELD_LABEL } from "./kit/inspector-ui";
import { useInspectorT } from "./kit/use-inspector-t";
import type {
  FieldInheritRow,
  InheritableStyleField,
} from "./inherit-override-fields";

const TOGGLE_OPTIONS = [
  { value: "inherit" as const, label: "Inherit" },
  { value: "override" as const, label: "Override" },
];

export interface NodeThemeInheritancePanelProps {
  rows: ReadonlyArray<FieldInheritRow>;
  /** Reset the field to inherit (clear the node literal → cascade shows). */
  onInherit: (field: InheritableStyleField) => void;
  /** Seed the resolved value as a literal so the operator edits an override. */
  onOverride: (field: InheritableStyleField, seedValue: string) => void;
}

export function NodeThemeInheritancePanel({
  rows,
  onInherit,
  onOverride,
}: NodeThemeInheritancePanelProps) {
  const { t } = useInspectorT();
  if (rows.length === 0) return null;
  return (
    <div
      className="flex flex-col gap-2 border-t pt-3"
      data-builder-node-inherit-panel=""
      style={{ borderColor: CHROME.line }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={FIELD_LABEL}>{t("Theme inheritance")}</span>
        <span
          className="text-[10px] font-medium"
          style={{ color: CHROME.muted2 }}
        >
          {t("Inherit follows the theme")}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <div
            key={row.field}
            className="flex items-center justify-between gap-2"
            data-builder-node-inherit-row={row.field}
            data-inherit-state={row.state}
          >
            <div className="flex min-w-0 flex-col">
              <span
                className="truncate text-[11px] font-medium"
                style={{ color: CHROME.ink }}
              >
                {t(row.label)}
              </span>
              <span
                className="truncate text-[10px]"
                style={{ color: CHROME.muted2 }}
                title={
                  row.state === "inherit"
                    ? t("Inherits {base}").replace("{base}", t(row.source))
                    : t("Overridden on this block")
                }
              >
                {row.state === "inherit"
                  ? `${t("Inherit")} · ${t(row.source)}`
                  : t("Override")}
              </span>
            </div>
            <Segmented
              compact
              value={row.state}
              options={TOGGLE_OPTIONS}
              onChange={(next) => {
                if (next === row.state) return;
                if (next === "inherit") {
                  onInherit(row.field);
                } else {
                  onOverride(row.field, row.seedValue);
                }
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
