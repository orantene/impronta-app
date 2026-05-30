"use client";

/**
 * Direct manipulation — canvas move grip.
 *
 * A grip at the centre of the selected freeform block that drags it around by
 * writing the non-destructive `style.translate` escape (CSS `translate`, e.g.
 * "24px -8px"). Unlike switching to absolute positioning, translate offsets
 * the element visually while leaving it in flow — so it's reversible and never
 * collapses the surrounding layout. Completes the resize / space / MOVE trio.
 *
 * Same mechanism as the resize + spacing handles: read the live translate on
 * grab, preview by writing the element's inline style during the drag, commit
 * once on release through the normal patch flow. 8px grid snap; Shift = free.
 */

import { useEffect, useRef, useState } from "react";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const GRID = 8;
// Only show the grip when the box is roomy enough that a centre control won't
// swamp the content or fight the resize/spacing handles.
const MIN_BOX = 64;

function parseTranslate(value: string): { x: number; y: number } {
  if (!value || value === "none") return { x: 0, y: 0 };
  const parts = value.trim().split(/\s+/);
  const x = parseFloat(parts[0] ?? "0") || 0;
  const y = parseFloat(parts[1] ?? "0") || 0;
  return { x, y };
}

export function CanvasMoveHandle({
  rect,
  liveEl,
  onCommitTranslate,
  accent = "#3d4f7c",
}: {
  rect: Rect;
  liveEl: HTMLElement | null;
  onCommitTranslate: (x: number, y: number) => void;
  accent?: string;
}) {
  const [dragging, setDragging] = useState(false);
  const [live, setLive] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const startRef = useRef<{
    px: number;
    py: number;
    x: number;
    y: number;
  } | null>(null);
  const latestRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const start = startRef.current;
      if (!start) return;
      const snap = (v: number) =>
        e.shiftKey ? Math.round(v) : Math.round(v / GRID) * GRID;
      const x = snap(start.x + (e.clientX - start.px));
      const y = snap(start.y + (e.clientY - start.py));
      latestRef.current = { x, y };
      setLive({ x, y });
      if (liveEl) liveEl.style.translate = `${x}px ${y}px`;
    };
    const onUp = () => {
      onCommitTranslate(latestRef.current.x, latestRef.current.y);
      setDragging(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, liveEl, onCommitTranslate]);

  if (rect.width < MIN_BOX || rect.height < MIN_BOX) return null;

  function begin(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const current = liveEl
      ? parseTranslate(getComputedStyle(liveEl).translate)
      : { x: 0, y: 0 };
    startRef.current = {
      px: e.clientX,
      py: e.clientY,
      x: current.x,
      y: current.y,
    };
    latestRef.current = current;
    setLive({ x: Math.round(current.x), y: Math.round(current.y) });
    setDragging(true);
  }

  return (
    <div
      aria-hidden
      data-canvas-move-overlay=""
      style={{
        position: "fixed",
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        pointerEvents: "none",
        zIndex: 96,
      }}
    >
      <button
        type="button"
        aria-label="Drag to move"
        title="Drag to move"
        data-canvas-move-handle=""
        onPointerDown={begin}
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 26,
          height: 26,
          borderRadius: 7,
          background: dragging ? accent : "rgba(61,79,124,0.55)",
          border: "2px solid #ffffff",
          boxShadow: dragging
            ? "0 0 0 3px rgba(61,79,124,0.25), 0 2px 6px rgba(0,0,0,0.35)"
            : "0 1px 4px rgba(0,0,0,0.30)",
          cursor: "move",
          pointerEvents: "auto",
          padding: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "background 100ms ease, box-shadow 100ms ease",
          touchAction: "none",
        }}
      >
        {/* 4-way arrow glyph */}
        <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden>
          <path
            d="M12 2l3 3h-2v6h6V9l3 3-3 3v-2h-6v6h2l-3 3-3-3h2v-6H5v2l-3-3 3-3v2h6V5H9l3-3z"
            fill="#ffffff"
          />
        </svg>
      </button>
      {dragging ? (
        <span
          style={{
            position: "absolute",
            top: "calc(50% + 20px)",
            left: "50%",
            transform: "translateX(-50%)",
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
          {`move ${live.x}, ${live.y}`}
        </span>
      ) : null}
    </div>
  );
}
