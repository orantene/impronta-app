"use client";

/**
 * Direct manipulation — canvas resize handles (first slice: width).
 *
 * Renders a drag handle on the right edge of the selected freeform node's
 * bounding box. Dragging sets the node's free `width` prop (a CSS length
 * string like "320px"), giving Webflow/Framer-style direct manipulation
 * instead of typing a number in the inspector.
 *
 * Isolated as its own component so its drag state never perturbs the
 * (React-Compiler-strict) selection-layer memoization. The parent passes the
 * selected element's viewport rect, the live DOM element (for an instant
 * preview during the drag), and a commit callback that persists the value
 * through the normal patch flow on release.
 *
 * Edit mode renders the page in the SAME document as the chrome, so this is
 * a plain same-document pointer drag — no cross-frame coordinate math.
 */

import { useEffect, useRef, useState } from "react";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const MIN_WIDTH = 40;

export function CanvasResizeHandles({
  rect,
  liveEl,
  onCommitWidth,
  accent = "#3d4f7c",
}: {
  /** Selected element's viewport rect (fixed-position coordinates). */
  rect: Rect;
  /** The selected DOM element — resized inline for a live preview. */
  liveEl: HTMLElement | null;
  /** Persist the final width (px) through the patch flow, on release. */
  onCommitWidth: (px: number) => void;
  accent?: string;
}) {
  const [dragging, setDragging] = useState(false);
  // Live width for the on-drag readout. Held in state (not a ref) so the
  // badge re-renders as the pointer moves; refs can't be read during render.
  const [liveWidth, setLiveWidth] = useState<number>(Math.round(rect.width));
  const startRef = useRef<{ x: number; w: number } | null>(null);
  const latestRef = useRef<number>(rect.width);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const start = startRef.current;
      if (!start) return;
      const next = Math.max(
        MIN_WIDTH,
        Math.round(start.w + (e.clientX - start.x)),
      );
      latestRef.current = next;
      setLiveWidth(next);
      // Instant preview: write straight to the element. The committed prop
      // re-applies the same width on release, so there's no visible snap.
      if (liveEl) liveEl.style.width = `${next}px`;
    };
    const onUp = () => {
      onCommitWidth(latestRef.current);
      setDragging(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, liveEl, onCommitWidth]);

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
      {/* Right-edge width handle */}
      <button
        type="button"
        aria-label="Drag to resize width"
        title="Drag to resize width"
        data-canvas-resize-handle="right"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          startRef.current = { x: e.clientX, w: rect.width };
          latestRef.current = rect.width;
          setLiveWidth(Math.round(rect.width));
          setDragging(true);
        }}
        style={{
          position: "absolute",
          top: "50%",
          right: -6,
          transform: "translateY(-50%)",
          width: 11,
          height: 30,
          borderRadius: 6,
          background: accent,
          border: "2px solid #ffffff",
          boxShadow: dragging
            ? "0 0 0 3px rgba(61,79,124,0.25), 0 2px 6px rgba(0,0,0,0.35)"
            : "0 1px 4px rgba(0,0,0,0.30)",
          cursor: "ew-resize",
          pointerEvents: "auto",
          padding: 0,
          transition: "box-shadow 100ms ease",
          touchAction: "none",
        }}
      />
      {/* Width readout while dragging */}
      {dragging ? (
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
          {liveWidth}px
        </span>
      ) : null}
    </div>
  );
}
