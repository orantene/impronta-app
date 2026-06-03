"use client";

/**
 * Direct manipulation — visual auto-layout GAP handles (#21).
 *
 * For a selected flex/grid layout CONTAINER (container / split / card /
 * cta_group / carousel-track / masonry / pricing-table — anything that honours
 * the `--bn-gap` variable), this paints a draggable pill in each visible gap
 * BETWEEN its children, the Figma/Webflow "auto-layout gap" gesture. Dragging a
 * pill rescales the container's single `style.gap` escape — the exact value the
 * Layout/Style panel's "Gap" control writes (`--bn-gap`), so a child track and
 * every consumer pick it up. Numeric feedback shows while dragging.
 *
 * Same mechanism as the resize/spacing handles: read the live computed gap on
 * grab, preview by writing the container's inline `gap`/`columnGap`/`rowGap`
 * during the drag, commit once on release through the normal patch flow (so
 * undo/redo + persistence are inherited). 8px grid snap; Shift = free.
 *
 * Orientation is derived from the children's RENDERED positions (robust across
 * flex-direction:row|column, wrap, and grid): a pair laid out side-by-side
 * drives column-gap; stacked drives row-gap. A single drag changes the one
 * shared `gap`, so any pill (whichever axis) edits the same value.
 */

import { useEffect, useRef, useState } from "react";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

type Axis = "x" | "y";

interface GapPill {
  // Midpoint of the gap, in viewport (fixed) coords.
  cx: number;
  cy: number;
  axis: Axis;
  // The actual measured gap span (px) this pill sits in — used to size the
  // pill so it reads as "this is the gap".
  span: number;
}

const GRID = 8;
// Don't surface gap handles on a near-empty/giant-child container — needs at
// least two children that actually sit apart.
const MIN_GAP_TO_SHOW = 2;
const ACCENT = "#2f4678";

function readGapPx(el: HTMLElement | null): number {
  if (!el) return 0;
  const cs = getComputedStyle(el);
  // columnGap/rowGap fall back to `gap`; prefer whichever is a real length.
  const col = parseFloat(cs.columnGap || "");
  const row = parseFloat(cs.rowGap || "");
  if (Number.isFinite(col) && col > 0) return col;
  if (Number.isFinite(row) && row > 0) return row;
  const g = parseFloat(cs.gap || "0");
  return Number.isFinite(g) ? g : 0;
}

/**
 * Measure the gaps between a container's laid-out children and produce one pill
 * per adjacent pair. Pairs that touch (no visible gap) are skipped.
 */
function measureGapPills(container: HTMLElement | null): GapPill[] {
  if (!container) return [];
  const kids = Array.from(container.children).filter(
    (c): c is HTMLElement => c instanceof HTMLElement,
  );
  const boxes = kids
    .map((el) => el.getBoundingClientRect())
    .filter((b) => b.width > 0 || b.height > 0);
  if (boxes.length < 2) return [];

  const pills: GapPill[] = [];
  // Sort by visual reading order: top, then left.
  const byPos = [...boxes].sort((a, b) =>
    Math.abs(a.top - b.top) > 4 ? a.top - b.top : a.left - b.left,
  );
  for (let i = 0; i < byPos.length - 1; i++) {
    const a = byPos[i];
    const b = byPos[i + 1];
    // Horizontal neighbours: vertically overlapping, b to the right of a.
    const vOverlap =
      Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 4;
    const hOverlap =
      Math.min(a.right, b.right) - Math.max(a.left, b.left) > 4;
    if (vOverlap && b.left >= a.right - 1) {
      const span = b.left - a.right;
      if (span >= MIN_GAP_TO_SHOW) {
        pills.push({
          axis: "x",
          cx: a.right + span / 2,
          cy: Math.max(a.top, b.top) + Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top),
          span,
        });
        // Recompute cy as the shared vertical midpoint of the overlap.
        pills[pills.length - 1].cy =
          (Math.max(a.top, b.top) + Math.min(a.bottom, b.bottom)) / 2;
      }
    } else if (hOverlap && b.top >= a.bottom - 1) {
      const span = b.top - a.bottom;
      if (span >= MIN_GAP_TO_SHOW) {
        pills.push({
          axis: "y",
          cy: a.bottom + span / 2,
          cx: (Math.max(a.left, b.left) + Math.min(a.right, b.right)) / 2,
          span,
        });
      }
    }
  }
  return pills;
}

export function CanvasGapHandles({
  rect,
  liveEl,
  onCommitGap,
}: {
  rect: Rect;
  liveEl: HTMLElement | null;
  onCommitGap: (px: number) => void;
}) {
  const [pills, setPills] = useState<GapPill[]>([]);
  const [dragging, setDragging] = useState(false);
  const [liveGap, setLiveGap] = useState<number>(0);
  const startRef = useRef<{
    axis: Axis;
    x: number;
    y: number;
    gap: number;
  } | null>(null);
  const latestRef = useRef<number>(0);

  // Re-measure pills whenever the selection box geometry / element changes.
  // (rect moves on scroll/resize/reflow, so this stays in sync with the
  // canvas without a ResizeObserver.)
  useEffect(() => {
    if (dragging) return;
    setPills(measureGapPills(liveEl));
  }, [liveEl, rect.top, rect.left, rect.width, rect.height, dragging]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const start = startRef.current;
      if (!start) return;
      // Dragging along the gap's axis, AWAY from the start, opens the gap.
      const delta =
        start.axis === "x" ? e.clientX - start.x : e.clientY - start.y;
      // A pill sits in the middle of the gap; pulling the pill toward the
      // higher-coordinate child (right/down) widens by 2× the half-shift, so
      // the felt motion matches the gesture. Use the raw delta for a 1:1 feel.
      let raw = start.gap + delta;
      raw = Math.max(0, raw);
      const next = e.shiftKey ? Math.round(raw) : Math.round(raw / GRID) * GRID;
      latestRef.current = next;
      setLiveGap(next);
      if (liveEl) {
        // Write all three so flex (gap), grid (gap), and column-based masonry
        // (column-gap) all preview live.
        liveEl.style.gap = `${next}px`;
        liveEl.style.columnGap = `${next}px`;
        liveEl.style.rowGap = `${next}px`;
        setPills(measureGapPills(liveEl));
      }
    };
    const onUp = () => {
      onCommitGap(latestRef.current);
      setDragging(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, liveEl, onCommitGap]);

  if (pills.length === 0) return null;

  function begin(axis: Axis, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const current = Math.max(0, Math.round(readGapPx(liveEl)));
    startRef.current = { axis, x: e.clientX, y: e.clientY, gap: current };
    latestRef.current = current;
    setLiveGap(current);
    setDragging(true);
  }

  return (
    <>
      {pills.map((pill, i) => {
        const horizontal = pill.axis === "x";
        // Pill fills the gap span (capped) with a comfortable cross thickness.
        const thickness = 8;
        const length = Math.min(Math.max(pill.span, 8), 44);
        return (
          <button
            key={`gap-${i}`}
            type="button"
            aria-label={`Drag to set gap (${horizontal ? "horizontal" : "vertical"})`}
            title="Drag to set gap"
            data-canvas-gap-handle={pill.axis}
            onPointerDown={(e) => begin(pill.axis, e)}
            style={{
              position: "fixed",
              left: pill.cx,
              top: pill.cy,
              transform: "translate(-50%, -50%)",
              width: horizontal ? thickness : length,
              height: horizontal ? length : thickness,
              borderRadius: 999,
              background: dragging ? ACCENT : "rgba(47,70,120,0.62)",
              border: "1.5px solid rgba(255,255,255,0.9)",
              boxShadow: dragging
                ? "0 0 0 3px rgba(47,70,120,0.22), 0 1px 5px rgba(0,0,0,0.3)"
                : "0 1px 4px rgba(0,0,0,0.28)",
              cursor: horizontal ? "ew-resize" : "ns-resize",
              pointerEvents: "auto",
              padding: 0,
              zIndex: 95,
              touchAction: "none",
            }}
          />
        );
      })}
      {dragging ? (
        <span
          aria-hidden
          data-canvas-gap-readout=""
          style={{
            position: "fixed",
            top: Math.max(rect.top + 6, 60),
            left: rect.left + rect.width / 2,
            transform: "translateX(-50%)",
            padding: "2px 7px",
            borderRadius: 5,
            background: ACCENT,
            color: "#ffffff",
            fontSize: 10,
            fontWeight: 700,
            lineHeight: 1.4,
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 98,
            fontFamily:
              'ui-sans-serif, "SF Pro Text", system-ui, -apple-system, sans-serif',
          }}
        >
          {`gap ${liveGap}px`}
        </span>
      ) : null}
    </>
  );
}
