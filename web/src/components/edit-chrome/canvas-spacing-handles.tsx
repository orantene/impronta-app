"use client";

/**
 * Direct manipulation — canvas spacing (padding) handles.
 *
 * Inner drag bars, one per side, that set the selected freeform node's free
 * per-side padding escape (`style.paddingTop/Right/Bottom/Left`) — the
 * Webflow/Framer "drag the padding" gesture. Sits alongside the resize
 * handles (which live on the OUTSIDE of the box); these bars live just INSIDE
 * each edge and use a warmer, flatter style so the two control classes read
 * differently.
 *
 * Same mechanism as the resize handles: read the live computed padding on
 * grab, preview by writing the element's inline style during the drag, and
 * commit once on release through the normal patch flow (so undo/redo +
 * persistence are inherited). 8px grid snap by default; hold Shift for free.
 */

import { useEffect, useRef, useState } from "react";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export type PaddingSide = "top" | "right" | "bottom" | "left";

const GRID = 8;
// Only show spacing handles when the box is big enough to host them without
// colliding with the resize handles / each other.
const MIN_BOX = 56;

const CSS_PROP: Record<PaddingSide, "paddingTop" | "paddingRight" | "paddingBottom" | "paddingLeft"> = {
  top: "paddingTop",
  right: "paddingRight",
  bottom: "paddingBottom",
  left: "paddingLeft",
};

export function CanvasSpacingHandles({
  rect,
  liveEl,
  onCommitPadding,
  accent = "#7a6f57",
}: {
  rect: Rect;
  liveEl: HTMLElement | null;
  onCommitPadding: (side: PaddingSide, px: number) => void;
  accent?: string;
}) {
  const [activeSide, setActiveSide] = useState<PaddingSide | null>(null);
  const [livePad, setLivePad] = useState<number>(0);
  const startRef = useRef<{
    side: PaddingSide;
    x: number;
    y: number;
    pad: number;
  } | null>(null);
  const latestRef = useRef<number>(0);

  useEffect(() => {
    if (!activeSide) return;
    const onMove = (e: PointerEvent) => {
      const start = startRef.current;
      if (!start) return;
      // Each side grows as the pointer moves toward the box centre.
      let raw: number;
      if (start.side === "left") raw = start.pad + (e.clientX - start.x);
      else if (start.side === "right") raw = start.pad + (start.x - e.clientX);
      else if (start.side === "top") raw = start.pad + (e.clientY - start.y);
      else raw = start.pad + (start.y - e.clientY);
      raw = Math.max(0, raw);
      const next = e.shiftKey ? Math.round(raw) : Math.round(raw / GRID) * GRID;
      latestRef.current = next;
      setLivePad(next);
      if (liveEl) liveEl.style[CSS_PROP[start.side]] = `${next}px`;
    };
    const onUp = () => {
      const start = startRef.current;
      if (start) onCommitPadding(start.side, latestRef.current);
      setActiveSide(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [activeSide, liveEl, onCommitPadding]);

  if (rect.width < MIN_BOX || rect.height < MIN_BOX) return null;

  function begin(side: PaddingSide, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const current = liveEl
      ? parseFloat(getComputedStyle(liveEl)[CSS_PROP[side]] || "0") || 0
      : 0;
    startRef.current = { side, x: e.clientX, y: e.clientY, pad: current };
    latestRef.current = current;
    setLivePad(Math.round(current));
    setActiveSide(side);
  }

  const bar = (extra: React.CSSProperties): React.CSSProperties => ({
    position: "absolute",
    background: accent,
    borderRadius: 3,
    pointerEvents: "auto",
    padding: 0,
    border: "none",
    opacity: 0.85,
    boxShadow: "0 0 0 1.5px rgba(255,255,255,0.85)",
    touchAction: "none",
    ...extra,
  });

  return (
    <div
      aria-hidden
      data-canvas-spacing-overlay=""
      style={{
        position: "fixed",
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        pointerEvents: "none",
        zIndex: 94,
      }}
    >
      {/* Top */}
      <button
        type="button"
        aria-label="Drag to set top padding"
        title="Drag to set top padding"
        data-canvas-spacing-handle="top"
        onPointerDown={(e) => begin("top", e)}
        style={bar({
          top: 5,
          left: "50%",
          transform: "translateX(-50%)",
          width: 26,
          height: 7,
          cursor: "ns-resize",
          opacity: activeSide === "top" ? 1 : 0.85,
        })}
      />
      {/* Bottom */}
      <button
        type="button"
        aria-label="Drag to set bottom padding"
        title="Drag to set bottom padding"
        data-canvas-spacing-handle="bottom"
        onPointerDown={(e) => begin("bottom", e)}
        style={bar({
          bottom: 5,
          left: "50%",
          transform: "translateX(-50%)",
          width: 26,
          height: 7,
          cursor: "ns-resize",
          opacity: activeSide === "bottom" ? 1 : 0.85,
        })}
      />
      {/* Left */}
      <button
        type="button"
        aria-label="Drag to set left padding"
        title="Drag to set left padding"
        data-canvas-spacing-handle="left"
        onPointerDown={(e) => begin("left", e)}
        style={bar({
          left: 5,
          top: "50%",
          transform: "translateY(-50%)",
          width: 7,
          height: 26,
          cursor: "ew-resize",
          opacity: activeSide === "left" ? 1 : 0.85,
        })}
      />
      {/* Right */}
      <button
        type="button"
        aria-label="Drag to set right padding"
        title="Drag to set right padding"
        data-canvas-spacing-handle="right"
        onPointerDown={(e) => begin("right", e)}
        style={bar({
          right: 5,
          top: "50%",
          transform: "translateY(-50%)",
          width: 7,
          height: 26,
          cursor: "ew-resize",
          opacity: activeSide === "right" ? 1 : 0.85,
        })}
      />
      {/* Readout */}
      {activeSide ? (
        <span
          style={{
            position: "absolute",
            top: 4,
            left: 4,
            padding: "2px 6px",
            borderRadius: 5,
            background: accent,
            color: "#ffffff",
            fontSize: 10,
            fontWeight: 700,
            lineHeight: 1.4,
            whiteSpace: "nowrap",
            pointerEvents: "none",
            fontFamily:
              'ui-sans-serif, "SF Pro Text", system-ui, -apple-system, sans-serif',
          }}
        >
          {`${activeSide} padding ${livePad}px`}
        </span>
      ) : null}
    </div>
  );
}
