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

  const allInherit = rows.every((row) => row.state === "inherit");
  const overrideCount = rows.filter((row) => row.state === "override").length;

  const rowsBody = (
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
  );

  // Default talent path: when everything still follows the theme, collapse the
  // four Inherit/Override rows behind one line so Quick styles can lead.
  if (allInherit) {
    return (
      <details
        className="rounded-[10px] border px-2.5 py-1.5"
        data-builder-node-inherit-panel=""
        data-inherit-collapsed="all"
        style={{
          borderColor: CHROME.lineStrong,
          background: CHROME.surface,
          boxShadow: "0 1px 2px rgba(17,24,39,0.03)",
        }}
      >
        <summary
          className="flex cursor-pointer list-none items-center justify-between gap-2 py-1"
          style={{ outline: "none" }}
        >
          <span className={FIELD_LABEL}>{t("Theme inheritance")}</span>
          <span
            className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
            style={{
              color: CHROME.accent,
              background: "rgba(124,58,237,0.08)",
            }}
          >
            {t("Following the theme")}
          </span>
        </summary>
        <div className="mt-2 flex flex-col gap-2 border-t pt-2" style={{ borderColor: CHROME.line }}>
          <span
            className="text-[10px] font-medium"
            style={{ color: CHROME.muted2 }}
          >
            {t("Inherit follows the theme")}
          </span>
          {rowsBody}
        </div>
      </details>
    );
  }

  return (
    <div
      className="flex flex-col gap-2 border-t pt-3"
      data-builder-node-inherit-panel=""
      data-inherit-collapsed="open"
      style={{ borderColor: CHROME.line }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={FIELD_LABEL}>{t("Theme inheritance")}</span>
        <span
          className="text-[10px] font-medium"
          style={{ color: CHROME.muted2 }}
        >
          {overrideCount === 1
            ? t("{count} override").replace("{count}", "1")
            : t("{count} overrides").replace(
                "{count}",
                String(overrideCount),
              )}
        </span>
      </div>
      {rowsBody}
    </div>
  );
}
