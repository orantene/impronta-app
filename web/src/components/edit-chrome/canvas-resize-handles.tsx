"use client";

/**
 * Direct manipulation — canvas resize handles.
 *
 * Drag handles on the selected freeform node's bounding box that write the
 * free `style.width` / `style.height` escapes — the same props the inspector
 * fields set — so a designer can size a block by dragging instead of typing a
 * number. This is the Tier-1 move toward "mimic any design."
 *
 *   • right edge  → width
 *   • bottom edge → height
 *   • SE corner   → width + height together
 *
 * Isolated as its own component so its drag state never perturbs the
 * (React-Compiler-strict) selection-layer memoization. The parent passes the
 * selected element's viewport rect, the live DOM element (for an instant
 * preview during the drag), and a commit callback that persists the value(s)
 * through the normal patch flow on release — so undo/redo and persistence come
 * for free.
 *
 * Edit mode renders the page in the SAME document as the chrome, so this is a
 * plain same-document pointer drag — no cross-frame coordinate math.
 */

import { useEffect, useRef, useState } from "react";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface ResizeCommit {
  width?: number;
  height?: number;
}

type Axis = "x" | "y" | "both";

const MIN_SIZE = 24;

export function CanvasResizeHandles({
  rect,
  liveEl,
  onCommit,
  accent = "#3d4f7c",
}: {
  /** Selected element's viewport rect (fixed-position coordinates). */
  rect: Rect;
  /** The selected DOM element — resized inline for a live preview. */
  liveEl: HTMLElement | null;
  /** Persist the final size through the patch flow, on release. */
  onCommit: (dims: ResizeCommit) => void;
  accent?: string;
}) {
  // Which handle is being dragged (null = idle). Held in state so the readout
  // badge + active-handle styling re-render; refs can't be read during render.
  const [activeAxis, setActiveAxis] = useState<Axis | null>(null);
  const [liveW, setLiveW] = useState<number>(Math.round(rect.width));
  const [liveH, setLiveH] = useState<number>(Math.round(rect.height));
  const startRef = useRef<{
    axis: Axis;
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const latestRef = useRef<{ w: number; h: number }>({
    w: rect.width,
    h: rect.height,
  });

  useEffect(() => {
    if (!activeAxis) return;
    const onMove = (e: PointerEvent) => {
      const start = startRef.current;
      if (!start) return;
      let w = latestRef.current.w;
      let h = latestRef.current.h;
      if (start.axis === "x" || start.axis === "both") {
        w = Math.max(MIN_SIZE, Math.round(start.w + (e.clientX - start.x)));
        latestRef.current.w = w;
        setLiveW(w);
        // Instant preview — the committed prop re-applies the same value on
        // release, so there is no visible snap.
        if (liveEl) liveEl.style.width = `${w}px`;
      }
      if (start.axis === "y" || start.axis === "both") {
        h = Math.max(MIN_SIZE, Math.round(start.h + (e.clientY - start.y)));
        latestRef.current.h = h;
        setLiveH(h);
        if (liveEl) liveEl.style.height = `${h}px`;
      }
    };
    const onUp = () => {
      const start = startRef.current;
      const dims: ResizeCommit = {};
      if (start?.axis === "x" || start?.axis === "both") {
        dims.width = latestRef.current.w;
      }
      if (start?.axis === "y" || start?.axis === "both") {
        dims.height = latestRef.current.h;
      }
      onCommit(dims);
      setActiveAxis(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [activeAxis, liveEl, onCommit]);

  function begin(axis: Axis, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    startRef.current = {
      axis,
      x: e.clientX,
      y: e.clientY,
      w: rect.width,
      h: rect.height,
    };
    latestRef.current = { w: rect.width, h: rect.height };
    setLiveW(Math.round(rect.width));
    setLiveH(Math.round(rect.height));
    setActiveAxis(axis);
  }

  const pill = (extra: React.CSSProperties): React.CSSProperties => ({
    position: "absolute",
    background: accent,
    border: "2px solid #ffffff",
    boxShadow: "0 1px 4px rgba(0,0,0,0.30)",
    pointerEvents: "auto",
    padding: 0,
    transition: "box-shadow 100ms ease",
    touchAction: "none",
    ...extra,
  });

  const activeShadow = "0 0 0 3px rgba(61,79,124,0.25), 0 2px 6px rgba(0,0,0,0.35)";

  return (
    <div
      aria-hidden
      data-canvas-resize-overlay=""
      style={{
        position: "fixed",
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        pointerEvents: "none",
        zIndex: 95,
      }}
    >
      {/* Right edge → width */}
      <button
        type="button"
        aria-label="Drag to resize width"
        title="Drag to resize width"
        data-canvas-resize-handle="right"
        onPointerDown={(e) => begin("x", e)}
        style={pill({
          top: "50%",
          right: -6,
          transform: "translateY(-50%)",
          width: 11,
          height: 30,
          borderRadius: 6,
          cursor: "ew-resize",
          boxShadow: activeAxis === "x" ? activeShadow : undefined,
        })}
      />
      {/* Bottom edge → height */}
      <button
        type="button"
        aria-label="Drag to resize height"
        title="Drag to resize height"
        data-canvas-resize-handle="bottom"
        onPointerDown={(e) => begin("y", e)}
        style={pill({
          left: "50%",
          bottom: -6,
          transform: "translateX(-50%)",
          width: 30,
          height: 11,
          borderRadius: 6,
          cursor: "ns-resize",
          boxShadow: activeAxis === "y" ? activeShadow : undefined,
        })}
      />
      {/* SE corner → width + height */}
      <button
        type="button"
        aria-label="Drag to resize width and height"
        title="Drag to resize"
        data-canvas-resize-handle="corner"
        onPointerDown={(e) => begin("both", e)}
        style={pill({
          right: -7,
          bottom: -7,
          width: 14,
          height: 14,
          borderRadius: 4,
          cursor: "nwse-resize",
          boxShadow: activeAxis === "both" ? activeShadow : undefined,
        })}
      />
      {/* Live size readout while dragging */}
      {activeAxis ? (
        <span
          style={{
            position: "absolute",
            top: -22,
            right: 0,
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
          {activeAxis === "x"
            ? `${liveW}px`
            : activeAxis === "y"
              ? `${liveH}px`
              : `${liveW} × ${liveH}`}
        </span>
      ) : null}
    </div>
  );
}
