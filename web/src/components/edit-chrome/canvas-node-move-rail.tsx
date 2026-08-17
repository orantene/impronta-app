"use client";

/**
 * canvas-node-move-rail — the on-hover grab affordance at a block's top-left.
 *
 * This started life (4A #7) as a single 22px grip button whose only gesture was
 * a drag. The operator report that produced this module: "make sure it's easy
 * to grab the white button to move up or down the section — right now it seems
 * impossible", and "there should be two small up and down arrows next to the
 * grabber so it will be easy to click and move it up or down with a click."
 *
 * That is a real gap, not a preference. Dragging is the only precise way to
 * REPARENT a block, but it is a bad way to do the overwhelmingly common thing —
 * nudge a block one position within the list it is already in. A drag for that
 * asks the operator to hold a button, cross an ambiguous drop zone, and read a
 * 2px indicator correctly, when the intent ("one slot up") is a single bit of
 * information. The arrows make that one bit cost one click, and route through
 * `moveBuilderNodeWithinParent` — the same chokepoint the layer-row arrows and
 * the chip's overflow menu already use, so there is no second move path.
 *
 * The rail lives in its own module (rather than inline in selection-layer.tsx)
 * because that file is on a line-count ratchet and because the rail is
 * self-contained: it is handed a rect, a label, and three callbacks.
 */

import type { DragEvent as ReactDragEvent } from "react";

import { CHROME } from "./kit";

/** Square size of each button in the rail. */
const BUTTON = 22;

/** Six-dot grab glyph — unchanged from the single-button original. */
function GripGlyph() {
  return (
    <svg width="9" height="14" viewBox="0 0 9 14" fill="currentColor" aria-hidden>
      <circle cx="2" cy="2" r="1" />
      <circle cx="7" cy="2" r="1" />
      <circle cx="2" cy="7" r="1" />
      <circle cx="7" cy="7" r="1" />
      <circle cx="2" cy="12" r="1" />
      <circle cx="7" cy="12" r="1" />
    </svg>
  );
}

function ChevronGlyph({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {direction === "up" ? <path d="M6 15l6-6 6 6" /> : <path d="M6 9l6 6 6-6" />}
    </svg>
  );
}

export interface CanvasNodeMoveRailProps {
  /** Viewport rect of the hovered block — the rail pins inside its top-left. */
  rect: { top: number; left: number };
  /** Human name of the block, for the accessible labels. */
  label: string;
  /** Spread onto every button so hover attribution keeps pointing at the block. */
  hoverAttributionProps: Record<string, string | undefined>;
  /** Node id, mirrored onto the grip for smoke tests / a11y tooling. */
  nodeId: string;
  /** Arms the existing HTML5 "move" canvas drag. */
  onDragStart: (event: ReactDragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  /** Selects the block (pointer-down parity with the chip grip). */
  onPointerDown: () => void;
  /** Null when the block is already first / last among its siblings. */
  onMoveUp: (() => void) | null;
  onMoveDown: (() => void) | null;
  /** Shared surface tokens from the selection layer, so the rail matches it. */
  background: string;
  boxShadow: string;
  /** Localiser from the selection layer's editor-locale hook. */
  t: (key: string) => string;
}

export function CanvasNodeMoveRail({
  rect,
  label,
  hoverAttributionProps,
  nodeId,
  onDragStart,
  onDragEnd,
  onPointerDown,
  onMoveUp,
  onMoveDown,
  background,
  boxShadow,
  t,
}: CanvasNodeMoveRailProps) {
  const buttonBase: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: BUTTON,
    height: BUTTON,
    padding: 0,
    border: "none",
    background: "transparent",
    color: CHROME.muted,
    pointerEvents: "auto",
  };

  return (
    <div
      data-canvas-node-move-rail=""
      {...hoverAttributionProps}
      style={{
        position: "fixed",
        // Sit just inside the ring's top-left corner; clamp to the viewport top
        // so the rail never hides under the topbar.
        top: Math.max(rect.top + 4, 60),
        left: rect.left + 4,
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 6,
        overflow: "hidden",
        background,
        boxShadow,
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        pointerEvents: "auto",
        zIndex: 94,
        touchAction: "none",
      }}
    >
      <button
        type="button"
        data-builder-node-hover-grip=""
        data-builder-node-id={nodeId}
        {...hoverAttributionProps}
        aria-label={t("Drag to move {label}").replace("{label}", label)}
        title={t("Drag to move / nest this block")}
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onPointerDown={onPointerDown}
        style={{ ...buttonBase, cursor: "grab" }}
      >
        <GripGlyph />
      </button>
      {/* Hairline between the drag surface and the click surface: pressing the
       *  grip starts a gesture, pressing an arrow commits an edit, and the two
       *  should not read as one strip of identical buttons. */}
      <span
        aria-hidden
        style={{ width: 1, height: 14, background: "rgba(24,24,27,0.12)" }}
      />
      {(["up", "down"] as const).map((direction) => {
        const handler = direction === "up" ? onMoveUp : onMoveDown;
        return (
          <button
            key={direction}
            type="button"
            data-canvas-node-move={direction}
            {...hoverAttributionProps}
            disabled={!handler}
            aria-label={
              direction === "up"
                ? t("Move {label} up").replace("{label}", label)
                : t("Move {label} down").replace("{label}", label)
            }
            title={direction === "up" ? t("Move up") : t("Move down")}
            // Selection has to happen on pointer-down, before the click commits,
            // so the move lands on the block the operator is pointing at rather
            // than on whatever happened to be selected beforehand.
            onPointerDown={onPointerDown}
            onClick={(event) => {
              event.stopPropagation();
              handler?.();
            }}
            style={{
              ...buttonBase,
              cursor: handler ? "pointer" : "default",
              // Disabled reads as "this block is already at the end of its
              // list", so it stays visible (and keeps the rail's width stable
              // between blocks) rather than disappearing.
              opacity: handler ? 1 : 0.3,
            }}
          >
            <ChevronGlyph direction={direction} />
          </button>
        );
      })}
    </div>
  );
}
