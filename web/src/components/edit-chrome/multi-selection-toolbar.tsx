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
  Group,
  Trash2,
  Ungroup,
} from "lucide-react";
import type { ReactNode } from "react";

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
}: {
  disabled: boolean;
  label: string;
  action: string;
  children: ReactNode;
  tone?: "danger";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={label}
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
  onAlign,
  onDistribute,
  onGroup,
  onUngroup,
  onDuplicate,
  onRemove,
}: {
  rect: Rect;
  count: number;
  disabled: boolean;
  canGroup: boolean;
  canUngroup: boolean;
  canDistribute: boolean;
  onAlign: (mode: MultiNodeAlignMode) => void;
  onDistribute: (mode: MultiNodeDistributeMode) => void;
  onGroup: () => void;
  onUngroup: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      data-multi-selection-toolbar=""
      data-edit-overlay="multi-selection-toolbar"
      style={{
        position: "fixed",
        top: Math.max(rect.top - 38, 58),
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
      <Divider />
      <IconButton
        disabled={disabled || !canGroup}
        label="Group selected blocks"
        action="group"
        onClick={onGroup}
      >
        <Group size={14} aria-hidden />
      </IconButton>
      <IconButton
        disabled={disabled || !canUngroup}
        label="Ungroup selected block"
        action="ungroup"
        onClick={onUngroup}
      >
        <Ungroup size={14} aria-hidden />
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
        label="Remove selected blocks"
        action="remove"
        tone="danger"
        onClick={onRemove}
      >
        <Trash2 size={14} aria-hidden />
      </IconButton>
    </div>
  );
}
