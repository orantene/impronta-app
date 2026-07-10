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
import type {
  MultiNodeAlignMode,
  MultiNodeDistributeMode,
} from "./multi-node-layout";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const TOOLBAR_BG =
  "linear-gradient(180deg, rgba(36,41,66,0.96) 0%, rgba(26,31,53,0.96) 100%)";

function Divider() {
  return (
    <span
      aria-hidden
      style={{
        width: 1,
        alignSelf: "stretch",
        background: "rgba(255,255,255,0.10)",
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
        color:
          tone === "danger" ? "rgba(255,210,210,0.95)" : "rgba(255,255,255,0.82)",
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
  rect,
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
  const [styleOpen, setStyleOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const toolbarTop = Math.max(rect.top - 38, 58);
  return (
    <>
    <BuilderCoachmarkTip
      id="multi-select-toolbar"
      message="Shift-click to select multiple blocks: align, group, and style them together."
      placement="above"
    >
      <span
        aria-hidden
        style={{
          position: "fixed",
          top: toolbarTop + 16,
          left: rect.left + rect.width / 2,
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
      aria-label="Selected blocks"
      style={{
        position: "fixed",
        top: toolbarTop,
        left: rect.left,
        height: 32,
        display: "inline-flex",
        alignItems: "stretch",
        maxWidth: "calc(100vw - 24px)",
        overflowX: "auto",
        overflowY: "hidden",
        borderRadius: 8,
        background: TOOLBAR_BG,
        color: "white",
        boxShadow:
          "0 12px 32px -8px rgba(0,0,0,0.38), 0 2px 6px -2px rgba(0,0,0,0.18), inset 0 0 0 1px rgba(255,255,255,0.08)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
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
          color: "rgba(255,255,255,0.86)",
          flex: "0 0 auto",
        }}
      >
        {count} selected
      </span>
      <Divider />
      <IconButton
        disabled={disabled}
        label="Align left"
        action="align-left"
        onClick={() => onAlign("left")}
      >
        <AlignStartVertical size={14} aria-hidden />
      </IconButton>
      <IconButton
        disabled={disabled}
        label="Align center"
        action="align-center"
        onClick={() => onAlign("center")}
      >
        <AlignCenterVertical size={14} aria-hidden />
      </IconButton>
      <IconButton
        disabled={disabled || !canGroup}
        label="Group selected blocks"
        action="group"
        onClick={onGroup}
      >
        <Group size={14} aria-hidden />
      </IconButton>
      <IconButton
        disabled={disabled}
        label="Duplicate selected blocks"
        action="duplicate"
        onClick={onDuplicate}
      >
        <CopyPlus size={14} aria-hidden />
      </IconButton>
      <IconButton
        disabled={disabled}
        label="More layout actions"
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
        label="Remove selected blocks"
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
          top: toolbarTop + 36,
          left: rect.left,
          display: "inline-flex",
          alignItems: "stretch",
          borderRadius: 8,
          background: TOOLBAR_BG,
          boxShadow:
            "0 12px 32px -8px rgba(0,0,0,0.38), inset 0 0 0 1px rgba(255,255,255,0.08)",
          zIndex: 101,
        }}
      >
      <IconButton
        disabled={disabled}
        label="Align right"
        action="align-right"
        onClick={() => onAlign("right")}
      >
        <AlignEndVertical size={14} aria-hidden />
      </IconButton>
      <IconButton
        disabled={disabled}
        label="Align top"
        action="align-top"
        onClick={() => onAlign("top")}
      >
        <AlignStartHorizontal size={14} aria-hidden />
      </IconButton>
      <IconButton
        disabled={disabled}
        label="Align middle"
        action="align-middle"
        onClick={() => onAlign("middle")}
      >
        <AlignCenterHorizontal size={14} aria-hidden />
      </IconButton>
      <IconButton
        disabled={disabled}
        label="Align bottom"
        action="align-bottom"
        onClick={() => onAlign("bottom")}
      >
        <AlignEndHorizontal size={14} aria-hidden />
      </IconButton>
      <IconButton
        disabled={disabled || !canDistribute}
        label="Distribute horizontally"
        action="distribute-horizontal"
        onClick={() => onDistribute("horizontal")}
      >
        <AlignHorizontalDistributeCenter size={14} aria-hidden />
      </IconButton>
      <IconButton
        disabled={disabled || !canDistribute}
        label="Distribute vertically"
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
              styleOpen ? "Hide shared style" : "Edit shared style for all"
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
        label="Ungroup selected block"
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
              styleOpen ? "Hide shared style" : "Edit shared style for all"
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
     *  overflow:hidden scroll-row can't clip it; anchored just below the
     *  toolbar via the same viewport rect. */}
    {canBulkStyle && styleOpen ? (
      <BulkStylePanel
        top={toolbarTop + 32 + 6}
        left={rect.left}
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
  top,
  left,
  disabled,
  onBulkStyle,
}: {
  top: number;
  left: number;
  disabled: boolean;
  onBulkStyle: (stylePatchJson: string) => void;
}) {
  const emit = (patch: Record<string, unknown>) =>
    onBulkStyle(JSON.stringify(patch));
  return (
    <div
      data-multi-selection-bulk-style=""
      data-edit-overlay="multi-selection-bulk-style"
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        top,
        left: Math.min(left, typeof window === "undefined" ? left : window.innerWidth - 244),
        width: 232,
        padding: 10,
        borderRadius: 8,
        background: TOOLBAR_BG,
        color: "white",
        boxShadow:
          "0 14px 36px -10px rgba(0,0,0,0.42), 0 2px 6px -2px rgba(0,0,0,0.2), inset 0 0 0 1px rgba(255,255,255,0.08)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
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
          color: "rgba(255,255,255,0.6)",
        }}
      >
        Apply to all selected
      </div>
      <BulkStyleRow
        label="Text colour"
        styleKey="textColor"
        kind="color"
        disabled={disabled}
        onEmit={emit}
      />
      <BulkStyleRow
        label="Background"
        styleKey="backgroundColor"
        kind="color"
        disabled={disabled}
        onEmit={emit}
      />
      <BulkStyleRow
        label="Corner radius"
        styleKey="borderRadius"
        kind="px"
        disabled={disabled}
        onEmit={emit}
      />
      <BulkStyleRow
        label="Opacity"
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
        color: "rgba(255,255,255,0.82)",
      }}
    >
      <span style={{ flex: "1 1 auto", minWidth: 0 }}>{label}</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, flex: "0 0 auto" }}>
        {kind === "color" ? (
          <input
            type="color"
            disabled={disabled}
            aria-label={`${label} for all selected`}
            value={value || "#000000"}
            onChange={(e) => {
              setValue(e.target.value);
              commit(e.target.value);
            }}
            style={{
              width: 28,
              height: 22,
              padding: 0,
              border: "1px solid rgba(255,255,255,0.16)",
              borderRadius: 5,
              background: "transparent",
              cursor: disabled ? "not-allowed" : "pointer",
            }}
          />
        ) : (
          <input
            type="number"
            disabled={disabled}
            aria-label={`${label} for all selected`}
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
              border: "1px solid rgba(255,255,255,0.16)",
              borderRadius: 5,
              background: "rgba(255,255,255,0.06)",
              color: "white",
              fontSize: 11.5,
              fontWeight: 600,
            }}
          />
        )}
        <button
          type="button"
          disabled={disabled}
          aria-label={`Clear ${label} on all selected`}
          title={`Clear ${label}`}
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
            color: "rgba(255,255,255,0.6)",
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
