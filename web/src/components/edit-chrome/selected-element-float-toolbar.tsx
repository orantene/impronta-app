"use client";

/**
 * SelectedElementFloatToolbar — the "middle float control" for the freeform
 * builder. A thin, light, premium pill that floats centered ABOVE a single
 * selected freeform builder node and exposes the most common per-node actions
 * as icon-only buttons.
 *
 * It is a sibling of the selection chip / multi-selection toolbar and shares
 * their operator-chrome look (the warm graphite gradient from selection-layer's
 * CHIP_BG + kit/tokens CHROME.chipInk family) so every floating control reads as
 * one cohesive tool surface rather than a stack of mismatched bars.
 *
 * Positioning mirrors the other overlays: viewport-fixed coordinates that match
 * the getBoundingClientRect() space the selection layer measures in, rendered
 * through a portal into document.body. The bar centers horizontally over the
 * rect (translateX(-50%)) and sits just above it, clamped under the top bar and
 * inside the viewport so it never floats off-screen on an element near an edge.
 */

import { ChevronDown, ChevronUp, Crosshair, EyeOff, Pencil } from "lucide-react";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { CHROME } from "./kit/tokens";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

// Same operator-chrome surface as the selection chip (CHIP_BG in
// selection-layer.tsx): warm indigo-graphite so the float bar belongs to the
// same tool family as the rest of the canvas chrome instead of reading as a
// black void on a black-brand tenant.
const TOOLBAR_BG = `linear-gradient(180deg, ${CHROME.chipInk} 0%, ${CHROME.chipInkDeep} 100%)`;
const TOOLBAR_SHADOW =
  "0 12px 32px -8px rgba(0,0,0,0.38), 0 2px 6px -2px rgba(0,0,0,0.18), inset 0 0 0 1px rgba(255,255,255,0.08), inset 0 1px 0 rgba(255,255,255,0.14)";

/** Distance the bar floats above the element's top edge. */
const FLOAT_GAP = 42;
/** Never rise above this (keeps the bar clear of the editor top bar). */
const TOP_CLAMP = 56;
/** Keep the bar this far inside the left/right viewport edges. */
const EDGE_MARGIN = 8;
/** Approximate half-width used for the horizontal clamp (5 buttons + padding). */
const HALF_WIDTH_ESTIMATE = 90;

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
  label,
  action,
  onClick,
  children,
}: {
  label: string;
  action: string;
  onClick: () => void;
  children: ReactNode;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onBlur={() => setHover(false)}
      aria-label={label}
      title={label}
      data-float-toolbar-action={action}
      style={{
        width: 26,
        height: 26,
        border: "none",
        borderRadius: 6,
        background: hover ? "rgba(255,255,255,0.14)" : "transparent",
        color: "#ffffff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        flex: "0 0 auto",
        transition: "background 110ms ease",
      }}
    >
      {children}
    </button>
  );
}

export function SelectedElementFloatToolbar({
  rect,
  onResetPosition,
  onLayerUp,
  onLayerDown,
  onEdit,
  onHide,
}: {
  rect: Rect | null;
  onResetPosition: () => void;
  onLayerUp: () => void;
  onLayerDown: () => void;
  onEdit: () => void;
  /** Optional — only rendered when a node-level hide is wired by the caller. */
  onHide?: () => void;
}) {
  if (!rect) return null;
  if (typeof document === "undefined") return null;

  const top = Math.max(rect.top - FLOAT_GAP, TOP_CLAMP);
  const centerX = rect.left + rect.width / 2;
  // Clamp the (post-translate) center so the bar stays fully inside the
  // viewport even when the element hugs a left/right edge.
  const minCenter = EDGE_MARGIN + HALF_WIDTH_ESTIMATE;
  const maxCenter =
    (typeof window !== "undefined" ? window.innerWidth : centerX) -
    EDGE_MARGIN -
    HALF_WIDTH_ESTIMATE;
  const clampedCenter =
    maxCenter >= minCenter
      ? Math.max(minCenter, Math.min(maxCenter, centerX))
      : centerX;

  return createPortal(
    <div
      data-float-toolbar=""
      data-edit-overlay="selected-element-float-toolbar"
      style={{
        position: "fixed",
        top,
        left: clampedCenter,
        transform: "translateX(-50%)",
        height: 32,
        display: "inline-flex",
        alignItems: "center",
        gap: 1,
        padding: "0 4px",
        borderRadius: 9,
        background: TOOLBAR_BG,
        color: "#ffffff",
        boxShadow: TOOLBAR_SHADOW,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        zIndex: 101,
        pointerEvents: "auto",
        whiteSpace: "nowrap",
        userSelect: "none",
        fontFamily:
          'ui-sans-serif, "SF Pro Text", system-ui, -apple-system, sans-serif',
      }}
    >
      <IconButton
        label="Reset position"
        action="reset-position"
        onClick={onResetPosition}
      >
        <Crosshair size={14} aria-hidden />
      </IconButton>
      <IconButton label="Bring forward" action="layer-up" onClick={onLayerUp}>
        <ChevronUp size={15} aria-hidden />
      </IconButton>
      <IconButton
        label="Send backward"
        action="layer-down"
        onClick={onLayerDown}
      >
        <ChevronDown size={15} aria-hidden />
      </IconButton>
      <Divider />
      <IconButton label="Edit" action="edit" onClick={onEdit}>
        <Pencil size={13} aria-hidden />
      </IconButton>
      {onHide ? (
        <IconButton label="Hide" action="hide" onClick={onHide}>
          <EyeOff size={14} aria-hidden />
        </IconButton>
      ) : null}
    </div>,
    document.body,
  );
}
