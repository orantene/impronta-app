"use client";

/**
 * 4C — Canvas Rulers and Guides (#31).
 *
 * Split out from `canvas-viewport.tsx` to keep that file under the 800-line
 * lint limit; the context/state/zoom logic lives there.
 *
 * RULERS
 *   Fixed-position 20px top + left rulers with adaptive tick marks (50/100/200 px
 *   intervals depending on zoom).  Dragging from a ruler creates a guide.
 *
 * GUIDES
 *   Session-scoped draggable guide lines stored in `CanvasViewportProvider`.
 *   Moving a guide to the ruler zone removes it.  A position label (doc-px)
 *   shows while the drag is active.
 *
 * GUIDE SNAP
 *   `findGuideSnap` exported for selection-layer: given a document-px position
 *   and the guide list, returns the nearest snapped position.
 */

import { useEffect, useRef, useState } from "react";

import { CHROME, EDIT_TOPBAR_H, Z_INDEX } from "./kit/tokens";
import {
  DEFAULT_WORKSPACE_CANVAS_MODE,
  resolveCanvasHudLeftInset,
} from "./workspace-layout";
import {
  useCanvasViewport,
  type CanvasGuide,
} from "./canvas-viewport";

// ── constants (mirrored from canvas-viewport — keep in sync) ───────────────
const RULER_SIZE = 20;
const GUIDE_REMOVE_ZONE = RULER_SIZE + 8;
const GUIDE_SNAP_PX = 6;

function newGuideId(): string {
  return `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// ── rulers ─────────────────────────────────────────────────────────────────

/**
 * `CanvasRulers` — fixed-position top and left ruler overlays.
 *
 * Tick spacing is adaptive: at low zoom the ticks are fewer and labelled
 * every 100 or 200 px; at high zoom they're denser and labelled every 50 px.
 * Dragging from a ruler into the canvas creates a guide at the cursor position.
 */
export function CanvasRulers({
  navigatorOpen,
  navigatorWidth,
}: {
  navigatorOpen: boolean;
  navigatorWidth: number;
}) {
  const { zoom, showRulers, addGuide, moveGuide, removeGuide } = useCanvasViewport();

  const [scroll, setScroll] = useState({ x: 0, y: 0 });
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onScroll = () => setScroll({ x: window.scrollX, y: window.scrollY });
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const [viewportW, setViewportW] = useState(1280);
  const [viewportH, setViewportH] = useState(800);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => {
      setViewportW(window.innerWidth);
      setViewportH(window.innerHeight);
    };
    onResize();
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Drag-to-create-guide state (ref = no re-render per pointer-move).
  const dragRef = useRef<{
    axis: "x" | "y";
    active: boolean;
    guideId: string | null;
  } | null>(null);

  function startGuideDrag(axis: "x" | "y") {
    dragRef.current = { axis, active: true, guideId: null };
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const left = resolveCanvasHudLeftInset({
      mode: DEFAULT_WORKSPACE_CANVAS_MODE,
      navigatorOpen,
      navigatorWidth,
    });
    const topOff = EDIT_TOPBAR_H;

    function onMove(e: PointerEvent) {
      const d = dragRef.current;
      if (!d?.active) return;
      // Convert viewport coords to document-px (zoom-adjusted).
      const docX = (e.clientX - left + scroll.x) / zoom;
      const docY = (e.clientY - topOff + scroll.y) / zoom;

      if (!d.guideId) {
        // Create the guide on first move.
        const newId = newGuideId();
        d.guideId = newId;
        addGuide({ axis: d.axis, positionPx: d.axis === "x" ? docY : docX });
        return;
      }
      const pos = d.axis === "x" ? docY : docX;
      moveGuide(d.guideId, pos);
    }

    function onUp(e: PointerEvent) {
      const d = dragRef.current;
      if (!d?.active) return;
      // Remove if released inside the ruler zone.
      if (d.guideId) {
        const inRulerZone =
          d.axis === "x"
            ? e.clientY < topOff + GUIDE_REMOVE_ZONE
            : e.clientX < left + GUIDE_REMOVE_ZONE;
        if (inRulerZone) removeGuide(d.guideId);
      }
      dragRef.current = null;
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [zoom, scroll, navigatorOpen, navigatorWidth, addGuide, moveGuide, removeGuide]);

  if (!showRulers) return null;

  const leftOffset = resolveCanvasHudLeftInset({
    mode: DEFAULT_WORKSPACE_CANVAS_MODE,
    navigatorOpen,
    navigatorWidth,
  });
  const topOffset = EDIT_TOPBAR_H; // topbar height

  // Adaptive tick interval in document-px.
  const rawInterval = 100 / zoom;
  const tickInterval = rawInterval < 40 ? 50 : rawInterval < 80 ? 100 : 200;
  const labelEvery = tickInterval <= 50 ? 2 : 1;

  const horizWidth = viewportW - leftOffset - RULER_SIZE;
  const vertHeight = viewportH - topOffset - RULER_SIZE;

  const horizStart = Math.floor((scroll.x / zoom) / tickInterval) * tickInterval;
  const horizEnd = (scroll.x + horizWidth) / zoom + tickInterval;
  const horizCount = Math.ceil((horizEnd - horizStart) / tickInterval);

  const vertStart = Math.floor((scroll.y / zoom) / tickInterval) * tickInterval;
  const vertEnd = (scroll.y + vertHeight) / zoom + tickInterval;
  const vertCount = Math.ceil((vertEnd - vertStart) / tickInterval);

  const rulerBg = CHROME.chipInk;
  const rulerFg = "rgba(255,255,255,0.45)";
  const rulerTick = "rgba(255,255,255,0.22)";
  const rulerFontSize = 8.5;

  return (
    <>
      {/* Horizontal ruler (top) */}
      <div
        data-edit-overlay="ruler-horizontal"
        aria-hidden
        className="pointer-events-auto fixed select-none overflow-hidden"
        style={{
          top: topOffset,
          left: leftOffset + RULER_SIZE,
          width: horizWidth,
          height: RULER_SIZE,
          zIndex: Z_INDEX.floatingControls,
          background: rulerBg,
          borderBottom: "1px solid rgba(255,255,255,0.10)",
          cursor: "ns-resize",
        }}
        onPointerDown={() => startGuideDrag("x")}
      >
        <svg width={horizWidth} height={RULER_SIZE} style={{ display: "block" }}>
          {Array.from({ length: horizCount }, (_, i) => {
            const docPx = horizStart + i * tickInterval;
            const vx = docPx * zoom - scroll.x;
            if (vx < 0 || vx > horizWidth) return null;
            const isLabel = i % labelEvery === 0;
            return (
              <g key={docPx}>
                <line
                  x1={vx}
                  y1={isLabel ? 8 : 12}
                  x2={vx}
                  y2={RULER_SIZE}
                  stroke={rulerTick}
                  strokeWidth={1}
                />
                {isLabel && (
                  <text
                    x={vx + 2}
                    y={6.5}
                    fill={rulerFg}
                    fontSize={rulerFontSize}
                    fontFamily="system-ui, sans-serif"
                    fontWeight={500}
                  >
                    {docPx}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Vertical ruler (left) */}
      <div
        data-edit-overlay="ruler-vertical"
        aria-hidden
        className="pointer-events-auto fixed select-none overflow-hidden"
        style={{
          top: topOffset + RULER_SIZE,
          left: leftOffset,
          width: RULER_SIZE,
          height: vertHeight,
          zIndex: Z_INDEX.floatingControls,
          background: rulerBg,
          borderRight: "1px solid rgba(255,255,255,0.10)",
          cursor: "ew-resize",
        }}
        onPointerDown={() => startGuideDrag("y")}
      >
        <svg width={RULER_SIZE} height={vertHeight} style={{ display: "block" }}>
          {Array.from({ length: vertCount }, (_, i) => {
            const docPx = vertStart + i * tickInterval;
            const vy = docPx * zoom - scroll.y;
            if (vy < 0 || vy > vertHeight) return null;
            const isLabel = i % labelEvery === 0;
            return (
              <g key={docPx}>
                <line
                  x1={isLabel ? 8 : 12}
                  y1={vy}
                  x2={RULER_SIZE}
                  y2={vy}
                  stroke={rulerTick}
                  strokeWidth={1}
                />
                {isLabel && (
                  <text
                    x={6}
                    y={vy + 2}
                    fill={rulerFg}
                    fontSize={rulerFontSize}
                    fontFamily="system-ui, sans-serif"
                    fontWeight={500}
                    transform={`rotate(-90, 6, ${vy + 2})`}
                    textAnchor="middle"
                  >
                    {docPx}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Corner square — fills the RULER_SIZE × RULER_SIZE gap between the two rulers. */}
      <div
        aria-hidden
        className="fixed z-[85]"
        style={{
          top: topOffset,
          left: leftOffset,
          width: RULER_SIZE,
          height: RULER_SIZE,
          background: rulerBg,
          borderRight: "1px solid rgba(255,255,255,0.10)",
          borderBottom: "1px solid rgba(255,255,255,0.10)",
        }}
      />
    </>
  );
}

// ── guides ─────────────────────────────────────────────────────────────────

/**
 * `CanvasGuides` — renders the draggable guide lines over the canvas.
 *
 * Guides are semi-transparent blue lines.  Dragging repositions; dropping onto
 * the ruler zone removes the guide.  A position label shows while dragging.
 */
export function CanvasGuides({
  navigatorOpen,
  navigatorWidth,
}: {
  navigatorOpen: boolean;
  navigatorWidth: number;
}) {
  const { zoom, showRulers, guides, moveGuide, removeGuide } = useCanvasViewport();

  const [scroll, setScroll] = useState({ x: 0, y: 0 });
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onScroll = () => setScroll({ x: window.scrollX, y: window.scrollY });
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Active drag state — ref (no re-render per pointermove).
  const dragRef = useRef<{
    id: string;
    axis: "x" | "y";
    active: boolean;
  } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragLabelPx, setDragLabelPx] = useState<number>(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const left = resolveCanvasHudLeftInset({
      mode: DEFAULT_WORKSPACE_CANVAS_MODE,
      navigatorOpen,
      navigatorWidth,
    });
    const top = EDIT_TOPBAR_H;

    function onMove(e: PointerEvent) {
      const d = dragRef.current;
      if (!d?.active) return;
      const pos =
        d.axis === "x"
          ? (e.clientY - top + scroll.y) / zoom
          : (e.clientX - left + scroll.x) / zoom;
      moveGuide(d.id, pos);
      setDragLabelPx(Math.round(pos));
    }

    function onUp(e: PointerEvent) {
      const d = dragRef.current;
      if (!d?.active) return;
      const rulerArea =
        d.axis === "x"
          ? e.clientY < top + GUIDE_REMOVE_ZONE
          : e.clientX < left + GUIDE_REMOVE_ZONE;
      if (rulerArea) removeGuide(d.id);
      dragRef.current = null;
      setDraggingId(null);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [zoom, scroll, navigatorOpen, navigatorWidth, moveGuide, removeGuide]);

  const leftOffset = resolveCanvasHudLeftInset({
    mode: DEFAULT_WORKSPACE_CANVAS_MODE,
    navigatorOpen,
    navigatorWidth,
  });
  const topOffset = EDIT_TOPBAR_H;
  const rulerGutter = showRulers ? RULER_SIZE : 0;

  const guideColor = "rgba(82, 130, 255, 0.65)";
  const guideColorActive = "rgba(82, 130, 255, 0.95)";

  return (
    <>
      {guides.map((guide) => {
        const isActive = draggingId === guide.id;
        let lineStyle: React.CSSProperties;

        if (guide.axis === "x") {
          const vy = guide.positionPx * zoom - scroll.y + topOffset + rulerGutter;
          lineStyle = {
            position: "fixed",
            top: vy,
            left: leftOffset + rulerGutter,
            right: 0,
            height: 1,
            background: isActive ? guideColorActive : guideColor,
            cursor: "ns-resize",
            zIndex: 83,
            pointerEvents: "auto",
          };
        } else {
          const vx = guide.positionPx * zoom - scroll.x + leftOffset + rulerGutter;
          lineStyle = {
            position: "fixed",
            left: vx,
            top: topOffset + rulerGutter,
            bottom: 0,
            width: 1,
            background: isActive ? guideColorActive : guideColor,
            cursor: "ew-resize",
            zIndex: 83,
            pointerEvents: "auto",
          };
        }

        return (
          <div
            key={guide.id}
            data-edit-overlay={`guide-${guide.id}`}
            // Machine-readable axis so drag gestures (move/resize handles) can
            // snapshot every guide's exact viewport position from the DOM —
            // see canvas-guide-snap.ts.
            data-canvas-guide-axis={guide.axis}
            aria-hidden
            style={lineStyle}
            onPointerDown={(e) => {
              e.stopPropagation();
              dragRef.current = { id: guide.id, axis: guide.axis, active: true };
              setDraggingId(guide.id);
              setDragLabelPx(Math.round(guide.positionPx));
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            }}
          >
            {isActive && (
              <div
                style={{
                  position: "absolute",
                  ...(guide.axis === "x" ? { left: 4, top: 2 } : { top: 4, left: 2 }),
                  background: CHROME.chipInk,
                  color: "rgba(255,255,255,0.9)",
                  fontSize: 9.5,
                  fontWeight: 600,
                  padding: "1px 5px",
                  borderRadius: 4,
                  letterSpacing: "-0.01em",
                  pointerEvents: "none",
                  whiteSpace: "nowrap",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
                }}
              >
                {dragLabelPx}px
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

// ── guide snap utility (exported for selection-layer) ──────────────────────

/**
 * Find the closest guide snap for a given document-px position.
 *
 * @param pos       Current position in document-px.
 * @param axis      "x" (horizontal guide → snaps y-axis movement) or "y".
 * @param guides    Current guide list from `useCanvasViewport()`.
 * @param tolerance Snap radius in document-px (default = GUIDE_SNAP_PX / 1px doc).
 * @returns The snapped position, or `pos` unchanged when no snap is near.
 */
export function findGuideSnap(
  pos: number,
  axis: "x" | "y",
  guides: ReadonlyArray<CanvasGuide>,
  tolerance: number = GUIDE_SNAP_PX,
): number {
  let best: number | null = null;
  let bestDist = tolerance + 1;
  for (const g of guides) {
    if (g.axis !== axis) continue;
    const dist = Math.abs(g.positionPx - pos);
    if (dist < bestDist) {
      bestDist = dist;
      best = g.positionPx;
    }
  }
  return best !== null ? best : pos;
}
