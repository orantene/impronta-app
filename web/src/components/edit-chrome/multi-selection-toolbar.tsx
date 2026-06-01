"use client";

import { CopyPlus, Group, Trash2, Ungroup } from "lucide-react";
import type { CSSProperties } from "react";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const TOOLBAR_BG =
  "linear-gradient(180deg, rgba(36,41,66,0.96) 0%, rgba(26,31,53,0.96) 100%)";

export function MultiSelectionToolbar({
  rect,
  count,
  disabled,
  canGroup,
  canUngroup,
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
  onGroup: () => void;
  onUngroup: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const buttonStyle: CSSProperties = {
    width: 32,
    height: 32,
    border: "none",
    borderLeft: "1px solid rgba(255,255,255,0.10)",
    background: "transparent",
    color: "rgba(255,255,255,0.82)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.52 : 1,
  };

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
        overflow: "hidden",
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
        }}
      >
        {count} selected
      </span>
      <button
        type="button"
        disabled={disabled || !canGroup}
        onClick={onGroup}
        aria-label="Group selected blocks"
        title="Group"
        data-multi-selection-action="group"
        style={buttonStyle}
      >
        <Group size={14} aria-hidden />
      </button>
      <button
        type="button"
        disabled={disabled || !canUngroup}
        onClick={onUngroup}
        aria-label="Ungroup selected block"
        title="Ungroup"
        data-multi-selection-action="ungroup"
        style={buttonStyle}
      >
        <Ungroup size={14} aria-hidden />
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onDuplicate}
        aria-label="Duplicate selected blocks"
        title="Duplicate"
        data-multi-selection-action="duplicate"
        style={buttonStyle}
      >
        <CopyPlus size={14} aria-hidden />
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onRemove}
        aria-label="Remove selected blocks"
        title="Remove"
        data-multi-selection-action="remove"
        style={{
          ...buttonStyle,
          color: "rgba(255,210,210,0.95)",
        }}
      >
        <Trash2 size={14} aria-hidden />
      </button>
    </div>
  );
}
