"use client";

import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  CopyPlus,
  Ellipsis,
  Group,
  Paintbrush,
  Trash2,
  Ungroup,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { BuilderCoachmarkTip } from "./builder-coachmark-tip";
import { BUILDER_VISUAL } from "./inspectors/kit/tokens";
import { CANVAS_FLOATING_BAR, CHROME, CHROME_RADII } from "./kit/tokens";
import type {
  MultiNodeAlignMode,
  MultiNodeDistributeMode,
} from "./multi-node-layout";
import { useEditorLocale } from "./use-editor-locale";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function Divider() {
  return (
    <span
      aria-hidden
      style={{
        width: 1,
        alignSelf: "stretch",
        background: CHROME.line,
        margin: "5px 0",
        flex: "0 0 auto",
      }}
    />
  );
}

function IconButton({
  disabled,
  label,
  action,
  children,
  tone,
  onClick,
  ariaExpanded,
  ariaHasPopup,
}: {
  disabled: boolean;
  label: string;
  action: string;
  children: ReactNode;
  tone?: "danger";
  onClick: () => void;
  /** Set on a button that toggles a popup (e.g. the "More" overflow menu). */
  ariaExpanded?: boolean;
  ariaHasPopup?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaHasPopup}
      data-multi-selection-action={action}
      style={{
        width: 30,
        height: 32,
        border: "none",
        background: "transparent",
        color: tone === "danger" ? "#b91c1c" : CHROME.muted,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.52 : 1,
        flex: "0 0 auto",
      }}
    >
      {children}
    </button>
  );
}

export function MultiSelectionToolbar({
  count,
  disabled,
  canGroup,
  canUngroup,
  canDistribute,
  canBulkStyle,
  onAlign,
  onDistribute,
  onGroup,
  onUngroup,
  onDuplicate,
  onRemove,
  onBulkStyle,
}: {
  rect: Rect;
  count: number;
  disabled: boolean;
  canGroup: boolean;
  canUngroup: boolean;
  canDistribute: boolean;
  /** Job #28 — at least one freeform block selected → shared-style editing is offered. */
  canBulkStyle: boolean;
  onAlign: (mode: MultiNodeAlignMode) => void;
  onDistribute: (mode: MultiNodeDistributeMode) => void;
  onGroup: () => void;
  onUngroup: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  /** Job #28 — apply a top-level style patch (JSON) to EVERY selected block. */
  onBulkStyle: (stylePatchJson: string) => void;
}) {
  // Job #28 — the shared-style editor is a small disclosure off the toolbar so
  // the common bulk action (align/distribute) stays one click away and the
  // heavier style editing is opt-in. State is local: it only governs the
  // panel's open/closed; every committed change fans out via onBulkStyle.
  const { t } = useEditorLocale();
  const [styleOpen, setStyleOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // Docked to the bottom control-bar stack (row 2, above the selection chip).
  // Popups open UPWARD from the bar, so they anchor off `bottom`, not `top`.
  const barBottom =
    CANVAS_FLOATING_BAR.bottom + CANVAS_FLOATING_BAR.height + 8;
  const popupBottom = barBottom + 32 + 6;
  return (
    <>
    <BuilderCoachmarkTip
      id="multi-select-toolbar"
      message={t("Shift-click to select multiple blocks: align, group, and style them together.")}
      placement="above"
    >
      <span
        aria-hidden
        style={{
          position: "fixed",
          bottom: barBottom + 16,
          left: "50%",
          width: 1,
          height: 1,
          pointerEvents: "none",
        }}
      />
    </BuilderCoachmarkTip>
    <div
      data-multi-selection-toolbar=""
      data-edit-overlay="multi-selection-toolbar"
      role="toolbar"
      aria-label={t("Selected blocks")}
      style={{
        position: "fixed",
        // Second row of the bottom control-bar stack: sits directly above the
        // selection chip so both stay visible and centered instead of one
        // floating over the canvas at the element's top-left corner.
        bottom: CANVAS_FLOATING_BAR.bottom + CANVAS_FLOATING_BAR.height + 8,
        // Centre within the space RIGHT of the zoom bar (shared baseline).
        left: `calc(50% + ${CANVAS_FLOATING_BAR.leftReserve / 2}px)`,
        transform: "translateX(-50%)",
        height: 32,
        display: "inline-flex",
        alignItems: "stretch",
        maxWidth: "min(96vw, 720px)",
        overflowX: "auto",
        overflowY: "hidden",
        borderRadius: CHROME_RADII.lg,
        background: CHROME.surface,
        color: CHROME.ink,
        boxShadow: BUILDER_VISUAL.toolbarShadow,
        border: `1px solid ${BUILDER_VISUAL.panelBorder}`,
        zIndex: 100,
        pointerEvents: "auto",
        fontFamily:
          'ui-sans-serif, "SF Pro Text", system-ui, -apple-system, sans-serif',
        userSelect: "none",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "0 10px",
          fontSize: 11,
          fontWeight: 700,
          color: CHROME.muted,
          flex: "0 0 auto",
        }}
      >
        {t("{count} selected").replace("{count}", String(count))}
      </span>
      <Divider />
      <IconButton
        disabled={disabled}
        label={t("Align left")}
        action="align-left"
        onClick={() => onAlign("left")}
      >
        <AlignStartVertical size={14} aria-hidden />
      </IconButton>
      <IconButton
        disabled={disabled}
        label={t("Align center")}
        action="align-center"
        onClick={() => onAlign("center")}
      >
        <AlignCenterVertical size={14} aria-hidden />
      </IconButton>
      <IconButton
        disabled={disabled || !canGroup}
        label={t("Group selected blocks")}
        action="group"
        onClick={onGroup}
      >
        <Group size={14} aria-hidden />
      </IconButton>
      <IconButton
        disabled={disabled}
        label={t("Duplicate selected blocks")}
        action="duplicate"
        onClick={onDuplicate}
      >
        <CopyPlus size={14} aria-hidden />
      </IconButton>
      <IconButton
        disabled={disabled}
        label={t("More layout actions")}
        action="more"
        ariaExpanded={moreOpen}
        ariaHasPopup
        onClick={() => setMoreOpen((open) => !open)}
      >
        <Ellipsis size={14} aria-hidden />
      </IconButton>
      <Divider />
      <IconButton
        disabled={disabled}
        label={t("Remove selected blocks")}
        action="remove"
        tone="danger"
        onClick={onRemove}
      >
        <Trash2 size={14} aria-hidden />
      </IconButton>
    </div>
    {moreOpen ? (
      <div
        data-multi-selection-more=""
        style={{
          position: "fixed",
          bottom: popupBottom,
          left: "50%",
          transform: "translateX(-50%)",
          display: "inline-flex",
          alignItems: "stretch",
          borderRadius: CHROME_RADII.lg,
          background: CHROME.surface,
          border: `1px solid ${BUILDER_VISUAL.panelBorder}`,
          boxShadow: BUILDER_VISUAL.toolbarShadow,
          zIndex: 101,
        }}
      >
      <IconButton
        disabled={disabled}
        label={t("Align right")}
        action="align-right"
        onClick={() => onAlign("right")}
      >
        <AlignEndVertical size={14} aria-hidden />
      </IconButton>
      <IconButton
        disabled={disabled}
        label={t("Align top")}
        action="align-top"
        onClick={() => onAlign("top")}
      >
        <AlignStartHorizontal size={14} aria-hidden />
      </IconButton>
      <IconButton
        disabled={disabled}
        label={t("Align middle")}
        action="align-middle"
        onClick={() => onAlign("middle")}
      >
        <AlignCenterHorizontal size={14} aria-hidden />
      </IconButton>
      <IconButton
        disabled={disabled}
        label={t("Align bottom")}
        action="align-bottom"
        onClick={() => onAlign("bottom")}
      >
        <AlignEndHorizontal size={14} aria-hidden />
      </IconButton>
      <IconButton
        disabled={disabled || !canDistribute}
        label={t("Distribute horizontally")}
        action="distribute-horizontal"
        onClick={() => onDistribute("horizontal")}
      >
        <AlignHorizontalDistributeCenter size={14} aria-hidden />
      </IconButton>
      <IconButton
        disabled={disabled || !canDistribute}
        label={t("Distribute vertically")}
        action="distribute-vertical"
        onClick={() => onDistribute("vertical")}
      >
        <AlignVerticalDistributeCenter size={14} aria-hidden />
      </IconButton>
      {canBulkStyle ? (
        <>
          <Divider />
          <IconButton
            disabled={disabled}
            label={
              styleOpen ? t("Hide shared style") : t("Edit shared style for all")
            }
            action="bulk-style"
            onClick={() => setStyleOpen((open) => !open)}
          >
            <Paintbrush size={14} aria-hidden />
          </IconButton>
        </>
      ) : null}
      <Divider />
      <IconButton
        disabled={disabled || !canUngroup}
        label={t("Ungroup selected block")}
        action="ungroup"
        onClick={onUngroup}
      >
        <Ungroup size={14} aria-hidden />
      </IconButton>
      {canBulkStyle ? (
        <>
          <Divider />
          <IconButton
            disabled={disabled}
            label={
              styleOpen ? t("Hide shared style") : t("Edit shared style for all")
            }
            action="bulk-style"
            onClick={() => setStyleOpen((open) => !open)}
          >
            <Paintbrush size={14} aria-hidden />
          </IconButton>
        </>
      ) : null}
      </div>
    ) : null}
    {/* Rendered as a SIBLING of the toolbar (not a child) so the toolbar's
     *  overflow:hidden scroll-row can't clip it; opens upward from the docked
     *  bar. */}
    {canBulkStyle && styleOpen ? (
      <BulkStylePanel
        bottom={popupBottom}
        disabled={disabled}
        onBulkStyle={onBulkStyle}
      />
    ) : null}
    </>
  );
}

/**
 * Job #28 — compact shared-style editor for a multi-selection. Renders the
 * scalar style props every freeform block has in common (text colour,
 * background, corner radius, opacity) and fans each committed change out to the
 * WHOLE selection via `onBulkStyle` — which routes through the same atomic
 * patch/undo op as align/distribute. Style keys (`color` / `backgroundColor` /
 * `borderRadius` / `opacity`) and the "trim → undefined to clear" convention
 * match the single-block style-panel so bulk + single edits stay consistent.
 *
 * The panel does NOT pre-fill from the selection (the blocks may differ); it's
 * an "apply this to all" surface, so an empty control = "leave as-is" and the
 * per-field × clears that prop across the selection.
 */
function BulkStylePanel({
  bottom,
  disabled,
  onBulkStyle,
}: {
  bottom: number;
  disabled: boolean;
  onBulkStyle: (stylePatchJson: string) => void;
}) {
  const { t } = useEditorLocale();
  const emit = (patch: Record<string, unknown>) =>
    onBulkStyle(JSON.stringify(patch));
  return (
    <div
      data-multi-selection-bulk-style=""
      data-edit-overlay="multi-selection-bulk-style"
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        bottom,
        // Centre within the space RIGHT of the zoom bar (shared baseline).
        left: `calc(50% + ${CANVAS_FLOATING_BAR.leftReserve / 2}px)`,
        transform: "translateX(-50%)",
        width: 232,
        padding: 10,
        borderRadius: CHROME_RADII.lg,
        background: CHROME.surface,
        color: CHROME.ink,
        border: `1px solid ${BUILDER_VISUAL.panelBorder}`,
        boxShadow: BUILDER_VISUAL.toolbarShadow,
        zIndex: 101,
        pointerEvents: "auto",
        display: "grid",
        gap: 9,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: CHROME.muted3,
        }}
      >
        {t("Apply to all selected")}
      </div>
      <BulkStyleRow
        label={t("Text colour")}
        styleKey="textColor"
        kind="color"
        disabled={disabled}
        onEmit={emit}
      />
      <BulkStyleRow
        label={t("Background")}
        styleKey="backgroundColor"
        kind="color"
        disabled={disabled}
        onEmit={emit}
      />
      <BulkStyleRow
        label={t("Corner radius")}
        styleKey="borderRadius"
        kind="px"
        disabled={disabled}
        onEmit={emit}
      />
      <BulkStyleRow
        label={t("Opacity")}
        styleKey="opacity"
        kind="opacity"
        disabled={disabled}
        onEmit={emit}
      />
    </div>
  );
}

function BulkStyleRow({
  label,
  styleKey,
  kind,
  disabled,
  onEmit,
}: {
  label: string;
  styleKey: string;
  kind: "color" | "px" | "opacity";
  disabled: boolean;
  onEmit: (patch: Record<string, unknown>) => void;
}) {
  const { t } = useEditorLocale();
  const [value, setValue] = useState("");
  const commit = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      onEmit({ [styleKey]: undefined });
      return;
    }
    if (kind === "px") {
      const n = Number.parseFloat(trimmed);
      onEmit({ [styleKey]: Number.isFinite(n) ? `${Math.max(0, n)}px` : undefined });
      return;
    }
    if (kind === "opacity") {
      const n = Number.parseFloat(trimmed);
      // BuilderNodeStyle.opacity is a unitless NUMBER (0–1), not a string.
      onEmit({
        [styleKey]: Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : undefined,
      });
      return;
    }
    onEmit({ [styleKey]: trimmed });
  };
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        fontSize: 11.5,
        fontWeight: 600,
        color: CHROME.ink,
      }}
    >
      <span style={{ flex: "1 1 auto", minWidth: 0 }}>{label}</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, flex: "0 0 auto" }}>
        {kind === "color" ? (
          <input
            type="color"
            disabled={disabled}
            aria-label={t("{label} for all selected").replace("{label}", label)}
            value={value || "#000000"}
            onChange={(e) => {
              setValue(e.target.value);
              commit(e.target.value);
            }}
            style={{
              width: 28,
              height: 22,
              padding: 0,
              border: `1px solid ${CHROME.line}`,
              borderRadius: 5,
              background: "transparent",
              cursor: disabled ? "not-allowed" : "pointer",
            }}
          />
        ) : (
          <input
            type="number"
            disabled={disabled}
            aria-label={t("{label} for all selected").replace("{label}", label)}
            value={value}
            min={0}
            max={kind === "opacity" ? 1 : undefined}
            step={kind === "opacity" ? 0.1 : 1}
            placeholder="—"
            onChange={(e) => setValue(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit((e.target as HTMLInputElement).value);
              }
            }}
            style={{
              width: 56,
              height: 22,
              padding: "0 6px",
              border: `1px solid ${CHROME.line}`,
              borderRadius: 5,
              background: "rgba(24,24,27,0.03)",
              color: CHROME.ink,
              fontSize: 11.5,
              fontWeight: 600,
            }}
          />
        )}
        <button
          type="button"
          disabled={disabled}
          aria-label={t("Clear {label} on all selected").replace("{label}", label)}
          title={t("Clear {label}").replace("{label}", label)}
          onClick={() => {
            setValue("");
            onEmit({ [styleKey]: undefined });
          }}
          style={{
            width: 18,
            height: 18,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            border: "none",
            borderRadius: 4,
            background: "transparent",
            color: CHROME.muted,
            cursor: disabled ? "not-allowed" : "pointer",
            fontSize: 13,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </span>
    </label>
  );
}
