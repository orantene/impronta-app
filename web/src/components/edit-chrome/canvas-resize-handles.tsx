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
  // A number sets the dimension (px); null clears it back to auto. Omitted =
  // leave unchanged.
  width?: number | null;
  height?: number | null;
}

type Axis = "x" | "y" | "both";

const MIN_SIZE = 24;
// Snap-to-grid step (Webflow-style). Hold Shift while dragging for free 1px.
const GRID = 8;
// Pointer distance (px) within which a drag snaps to a parent-derived target.
const SNAP_THRESHOLD = 14;
// Pointer distance (px) within which the dragged EDGE snaps to a sibling /
// parent edge (4A #8 alignment guide during resize).
const EDGE_SNAP = 8;
// Violet alignment-guide colour (one guide language across resize/move/gap;
// a line-up to a neighbour edge/centre).
const ALIGN_GUIDE = "#7c3aed";

/**
 * Snap a raw dragged length to (a) the nearest grid step, and (b) any of the
 * supplied parent-derived targets (full width, halves, thirds) when close.
 * Returns the snapped value plus a short label when a parent target won — used
 * to surface a "Full" / "½" hint in the readout. Shift bypasses all snapping.
 */
function snapLength(
  raw: number,
  free: boolean,
  targets: ReadonlyArray<{ value: number; label: string }>,
): { value: number; label: string | null } {
  if (free) return { value: Math.round(raw), label: null };
  for (const t of targets) {
    if (Math.abs(raw - t.value) <= SNAP_THRESHOLD) {
      return { value: Math.round(t.value), label: t.label };
    }
  }
  return { value: Math.round(raw / GRID) * GRID, label: null };
}

export function CanvasResizeHandles({
  rect,
  liveEl,
  onCommit,
  accent = "#7c3aed",
  overlayRef,
}: {
  /** Selected element's viewport rect (fixed-position coordinates). */
  rect: Rect;
  /** The selected DOM element — resized inline for a live preview. */
  liveEl: HTMLElement | null;
  /** Persist the final size through the patch flow, on release. */
  onCommit: (dims: ResizeCommit) => void;
  accent?: string;
  /**
   * When provided, the parent owns the overlay box's top/left/width/height and
   * writes them imperatively every frame (rAF) so the controls track scroll /
   * drag with no React re-render. This component then stops positioning the
   * overlay from `rect`; it still uses `rect` only as the first-paint fallback
   * size + for the readout's live width/height seed.
   */
  overlayRef?: React.Ref<HTMLDivElement>;
}) {
  // Which handle is being dragged (null = idle). Held in state so the readout
  // badge + active-handle styling re-render; refs can't be read during render.
  const [activeAxis, setActiveAxis] = useState<Axis | null>(null);
  const [liveW, setLiveW] = useState<number>(Math.round(rect.width));
  const [liveH, setLiveH] = useState<number>(Math.round(rect.height));
  // Non-null while the current drag is snapped to a parent target (e.g. "Full").
  const [snapHint, setSnapHint] = useState<string | null>(null);
  // 4A #8 — alignment-guide coordinates (viewport px) when the dragged edge
  // lines up with a sibling/parent edge; null when not snapped to one.
  const [edgeGuide, setEdgeGuide] = useState<{ vx: number | null; hy: number | null }>(
    { vx: null, hy: null },
  );
  const startRef = useRef<{
    axis: Axis;
    x: number;
    y: number;
    w: number;
    h: number;
    // Element's fixed origin at grab-time (stable while WE resize); used to map
    // a width/height to the dragged edge's viewport coord for the edge snap.
    left: number;
    top: number;
    // Sibling/parent edge X coords (for the right edge) + Y coords (bottom edge).
    edgeX: number[];
    edgeY: number[];
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
      const free = e.shiftKey;
      const parent = liveEl?.parentElement ?? null;
      let snapLabel: string | null = null;
      let guideVx: number | null = null;
      let guideHy: number | null = null;
      if (start.axis === "x" || start.axis === "both") {
        const raw = start.w + (e.clientX - start.x);
        const parentW = parent?.getBoundingClientRect().width ?? 0;
        const targets = parentW
          ? [
              { value: parentW, label: "Full" },
              { value: parentW / 2, label: "½" },
              { value: (parentW * 2) / 3, label: "⅔" },
              { value: parentW / 3, label: "⅓" },
            ]
          : [];
        const snapped = snapLength(raw, free, targets);
        w = Math.max(MIN_SIZE, snapped.value);
        if (snapped.label) snapLabel = snapped.label;
        // 4A #8 — when no parent fraction won, snap the RIGHT edge's viewport X
        // to the nearest sibling/parent edge and draw a vertical guide there.
        if (!free && !snapped.label) {
          const edgeX = start.left + w;
          let best: { coord: number; d: number } | null = null;
          for (const coord of start.edgeX) {
            const d = Math.abs(coord - edgeX);
            if (d <= EDGE_SNAP && (!best || d < best.d)) best = { coord, d };
          }
          if (best) {
            w = Math.max(MIN_SIZE, Math.round(best.coord - start.left));
            guideVx = best.coord;
          }
        }
        latestRef.current.w = w;
        setLiveW(w);
        // Instant preview — the committed prop re-applies the same value on
        // release, so there is no visible snap.
        if (liveEl) liveEl.style.width = `${w}px`;
      }
      if (start.axis === "y" || start.axis === "both") {
        const raw = start.h + (e.clientY - start.y);
        const snapped = snapLength(raw, free, []);
        h = Math.max(MIN_SIZE, snapped.value);
        if (!free) {
          const edgeY = start.top + h;
          let best: { coord: number; d: number } | null = null;
          for (const coord of start.edgeY) {
            const d = Math.abs(coord - edgeY);
            if (d <= EDGE_SNAP && (!best || d < best.d)) best = { coord, d };
          }
          if (best) {
            h = Math.max(MIN_SIZE, Math.round(best.coord - start.top));
            guideHy = best.coord;
          }
        }
        latestRef.current.h = h;
        setLiveH(h);
        if (liveEl) liveEl.style.height = `${h}px`;
      }
      setSnapHint(snapLabel);
      setEdgeGuide({ vx: guideVx, hy: guideHy });
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
      setSnapHint(null);
      setEdgeGuide({ vx: null, hy: null });
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
    // 4A #8 — capture sibling + parent edge coordinates once on grab (they
    // don't move while WE resize). The right edge can snap to a sibling's
    // left/right or the parent's right inner edge; the bottom edge likewise.
    const edgeX: number[] = [];
    const edgeY: number[] = [];
    const parentNode = liveEl?.parentElement ?? null;
    if (parentNode) {
      const pr = parentNode.getBoundingClientRect();
      edgeX.push(pr.left, pr.left + pr.width);
      edgeY.push(pr.top, pr.top + pr.height);
      for (const sib of Array.from(parentNode.children)) {
        if (sib === liveEl || !(sib instanceof HTMLElement)) continue;
        const sr = sib.getBoundingClientRect();
        if (sr.width === 0 && sr.height === 0) continue;
        edgeX.push(sr.left, sr.left + sr.width);
        edgeY.push(sr.top, sr.top + sr.height);
      }
    }
    startRef.current = {
      axis,
      x: e.clientX,
      y: e.clientY,
      w: rect.width,
      h: rect.height,
      left: rect.left,
      top: rect.top,
      edgeX,
      edgeY,
    };
    latestRef.current = { w: rect.width, h: rect.height };
    setLiveW(Math.round(rect.width));
    setLiveH(Math.round(rect.height));
    setSnapHint(null);
    setEdgeGuide({ vx: null, hy: null });
    setActiveAxis(axis);
  }

  // Double-click a handle to clear its fixed dimension(s) back to auto — the
  // standard "un-fix a size" gesture. Clears the inline preview immediately so
  // the element snaps to content-driven size, then persists the cleared prop.
  function reset(axis: Axis) {
    const dims: ResizeCommit = {};
    if (axis === "x" || axis === "both") dims.width = null;
    if (axis === "y" || axis === "both") dims.height = null;
    // The inline preview style is cleared by the commit handler (which owns a
    // non-prop reference to the element), keeping this render-scope function
    // free of prop mutation.
    onCommit(dims);
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
    <>
      {/* 4A #8 — resize alignment guides. A magenta line at the sibling/parent
       *  edge the dragged width/height edge has snapped to. Drawn in viewport
       *  coords (outside the rect-offset overlay) spanning the active edge's
       *  axis so the line-up reads at a glance. */}
      {edgeGuide.vx !== null ? (
        <div
          aria-hidden
          data-canvas-resize-align-guide="v"
          style={{
            position: "fixed",
            left: edgeGuide.vx,
            top: 0,
            width: 0,
            height: "100vh",
            borderLeft: `1px solid ${ALIGN_GUIDE}`,
            pointerEvents: "none",
            zIndex: 97,
          }}
        />
      ) : null}
      {edgeGuide.hy !== null ? (
        <div
          aria-hidden
          data-canvas-resize-align-guide="h"
          style={{
            position: "fixed",
            top: edgeGuide.hy,
            left: 0,
            height: 0,
            width: "100vw",
            borderTop: `1px solid ${ALIGN_GUIDE}`,
            pointerEvents: "none",
            zIndex: 97,
          }}
        />
      ) : null}
      <div
        ref={overlayRef}
        aria-hidden
        data-canvas-resize-overlay=""
        style={{
          position: "fixed",
          // When overlayRef is wired the parent's rAF loop OWNS
          // top/left/width/height (written directly each frame, seeded
          // synchronously before first paint via useLayoutEffect) so the box
          // tracks scroll/drag with no React re-render and never trails. Without
          // overlayRef, fall back to positioning from the rect prop. Either way
          // the box always has width/height so the inner handles' 50% /
          // right:-6 / bottom:-6 offsets resolve.
          ...(overlayRef
            ? null
            : {
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
              }),
          pointerEvents: "none",
          zIndex: 95,
        }}
      >
        {/* Right edge → width */}
      <button
        type="button"
        aria-label="Drag to resize width (double-click to reset)"
        title="Drag to resize width · double-click to reset"
        data-canvas-resize-handle="right"
        onPointerDown={(e) => begin("x", e)}
        onDoubleClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          reset("x");
        }}
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
        aria-label="Drag to resize height (double-click to reset)"
        title="Drag to resize height · double-click to reset"
        data-canvas-resize-handle="bottom"
        onPointerDown={(e) => begin("y", e)}
        onDoubleClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          reset("y");
        }}
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
        aria-label="Drag to resize width and height (double-click to reset)"
        title="Drag to resize · double-click to reset"
        data-canvas-resize-handle="corner"
        onPointerDown={(e) => begin("both", e)}
        onDoubleClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          reset("both");
        }}
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
      {/* Live size readout while dragging — W×H + a one-line modifier hint
       *  (W3-T6). Shift bypasses snapping ("free"); that is the only modifier
       *  this handle implements, so it is the only one advertised. */}
      {activeAxis ? (
        <span
          style={{
            position: "absolute",
            top: -22,
            right: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 2,
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
          <span>
            {(activeAxis === "x"
              ? `${liveW}px`
              : activeAxis === "y"
                ? `${liveH}px`
                : `${liveW} × ${liveH}`) + (snapHint ? `  ·  ${snapHint}` : "")}
          </span>
          <span style={{ fontWeight: 600, opacity: 0.78, fontSize: 9 }}>
            ⇧ free
          </span>
        </span>
      ) : null}
      </div>
    </>
  );
}
