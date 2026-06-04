"use client";

/**
 * Direct manipulation — canvas box-model spacing (padding + margin) handles.
 *
 * A browser-devtools-style box-model visualizer over the selected freeform
 * node: the node's PADDING is painted as warm inner bands and its MARGIN as
 * cooler outer bands, and every band is a drag target.
 *
 *   - Inner padding bars set the free per-side padding escape
 *     (`style.paddingTop/Right/Bottom/Left`) — the Webflow/Framer "drag the
 *     padding" gesture. These sit just INSIDE each edge.
 *   - Outer margin bars set the free per-side margin escape
 *     (`style.marginTopFree/RightFree/BottomFree/LeftFree`, the collision-safe
 *     keys the Style panel writes). These sit just OUTSIDE each edge.
 *
 * Sits alongside the resize handles (which live on the OUTSIDE corners/edges);
 * the spacing bars use flatter, tinted fills so the control classes read
 * differently. Same mechanism as the resize handles: read the live computed
 * value on grab, preview by writing the element's inline style during the
 * drag, and commit once on release through the normal patch flow (so undo/redo
 * + persistence are inherited). 8px grid snap by default; hold Shift for free.
 *
 * `BoxModelHoverBands` is the passive (non-draggable) sibling used on the
 * HOVERED block — same devtools tinting, no controls — so the box model is
 * legible before you even select.
 */

import { useEffect, useRef, useState } from "react";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export type PaddingSide = "top" | "right" | "bottom" | "left";
export type MarginSide = "top" | "right" | "bottom" | "left";

const GRID = 8;
// Only show spacing handles when the box is big enough to host them without
// colliding with the resize handles / each other.
const MIN_BOX = 56;

// Devtools box-model palette: warm sienna for padding, cooler amber-tan for
// margin (deliberately distinct so the two zones never read as one block).
const PADDING_FILL = "rgba(140,118,72,0.26)";
const MARGIN_FILL = "rgba(120,140,170,0.22)";

const CSS_PROP: Record<PaddingSide, "paddingTop" | "paddingRight" | "paddingBottom" | "paddingLeft"> = {
  top: "paddingTop",
  right: "paddingRight",
  bottom: "paddingBottom",
  left: "paddingLeft",
};

const MARGIN_CSS_PROP: Record<
  MarginSide,
  "marginTop" | "marginRight" | "marginBottom" | "marginLeft"
> = {
  top: "marginTop",
  right: "marginRight",
  bottom: "marginBottom",
  left: "marginLeft",
};

type ActiveDrag =
  | { kind: "padding"; side: PaddingSide }
  | { kind: "margin"; side: MarginSide };

function readComputedPx(el: HTMLElement | null, prop: string): number {
  if (!el) return 0;
  const raw = getComputedStyle(el)[prop as "paddingTop"] || "0";
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

export function CanvasSpacingHandles({
  rect,
  liveEl,
  onCommitPadding,
  onCommitMargin,
  accent = "#7a6f57",
  overlayRef,
}: {
  rect: Rect;
  liveEl: HTMLElement | null;
  onCommitPadding: (side: PaddingSide, px: number) => void;
  /**
   * Optional — when provided, the OUTER margin bands become draggable and write
   * the free margin escape. Without it, only the padding bands render (back-compat
   * with the original padding-only handles).
   */
  onCommitMargin?: (side: MarginSide, px: number) => void;
  accent?: string;
  /**
   * When provided, the parent owns the overlay box's top/left/width/height and
   * writes them imperatively each frame (rAF) so the box-model controls track
   * scroll / drag with no React re-render. The bands + grab bars are positioned
   * RELATIVE to this box, so they ride along automatically.
   */
  overlayRef?: React.Ref<HTMLDivElement>;
}) {
  const [active, setActive] = useState<ActiveDrag | null>(null);
  const [liveVal, setLiveVal] = useState<number>(0);
  // Live per-side margin sizes (px), read on mount + while dragging, so the
  // outer bands render at the element's real margins (devtools-accurate).
  const [margins, setMargins] = useState<Record<MarginSide, number>>({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  });
  const startRef = useRef<{
    drag: ActiveDrag;
    x: number;
    y: number;
    val: number;
  } | null>(null);
  const latestRef = useRef<number>(0);

  const showMargins = !!onCommitMargin;

  // Read the live margins whenever the box geometry or target element changes,
  // so the outer bands match reality even after an external edit.
  useEffect(() => {
    if (!showMargins) return;
    setMargins({
      top: Math.max(0, readComputedPx(liveEl, "marginTop")),
      right: Math.max(0, readComputedPx(liveEl, "marginRight")),
      bottom: Math.max(0, readComputedPx(liveEl, "marginBottom")),
      left: Math.max(0, readComputedPx(liveEl, "marginLeft")),
    });
    // rect changes whenever the selection moves/resizes; liveEl on re-target.
  }, [showMargins, liveEl, rect.top, rect.left, rect.width, rect.height]);

  useEffect(() => {
    if (!active) return;
    const onMove = (e: PointerEvent) => {
      const start = startRef.current;
      if (!start) return;
      const side = start.drag.side;
      // Each side grows as the pointer moves toward the box centre (padding) or
      // away from it (margin pushes the box edge outward).
      let raw: number;
      if (start.drag.kind === "padding") {
        if (side === "left") raw = start.val + (e.clientX - start.x);
        else if (side === "right") raw = start.val + (start.x - e.clientX);
        else if (side === "top") raw = start.val + (e.clientY - start.y);
        else raw = start.val + (start.y - e.clientY);
      } else {
        // Margin: dragging the outer band away from the box increases margin.
        if (side === "left") raw = start.val + (start.x - e.clientX);
        else if (side === "right") raw = start.val + (e.clientX - start.x);
        else if (side === "top") raw = start.val + (start.y - e.clientY);
        else raw = start.val + (e.clientY - start.y);
      }
      raw = Math.max(0, raw);
      const next = e.shiftKey ? Math.round(raw) : Math.round(raw / GRID) * GRID;
      latestRef.current = next;
      setLiveVal(next);
      if (liveEl) {
        if (start.drag.kind === "padding") {
          liveEl.style[CSS_PROP[side]] = `${next}px`;
        } else {
          liveEl.style[MARGIN_CSS_PROP[side]] = `${next}px`;
          setMargins((prev) => ({ ...prev, [side]: next }));
        }
      }
    };
    const onUp = () => {
      const start = startRef.current;
      if (start) {
        if (start.drag.kind === "padding") {
          onCommitPadding(start.drag.side, latestRef.current);
        } else {
          onCommitMargin?.(start.drag.side, latestRef.current);
        }
      }
      setActive(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [active, liveEl, onCommitPadding, onCommitMargin]);

  if (rect.width < MIN_BOX || rect.height < MIN_BOX) return null;

  function beginPadding(side: PaddingSide, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const current = Math.max(0, readComputedPx(liveEl, CSS_PROP[side]));
    startRef.current = {
      drag: { kind: "padding", side },
      x: e.clientX,
      y: e.clientY,
      val: current,
    };
    latestRef.current = current;
    setLiveVal(Math.round(current));
    setActive({ kind: "padding", side });
  }

  function beginMargin(side: MarginSide, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const current = Math.max(0, readComputedPx(liveEl, MARGIN_CSS_PROP[side]));
    startRef.current = {
      drag: { kind: "margin", side },
      x: e.clientX,
      y: e.clientY,
      val: current,
    };
    latestRef.current = current;
    setLiveVal(Math.round(current));
    setActive({ kind: "margin", side });
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

  // Margin grab bars sit OUTSIDE the box; positioned relative to the same fixed
  // overlay rect (which is the border box) by offsetting negatively.
  const marginBar = (extra: React.CSSProperties): React.CSSProperties => ({
    position: "absolute",
    background: "#5f7290",
    borderRadius: 3,
    pointerEvents: "auto",
    padding: 0,
    border: "none",
    opacity: 0.8,
    boxShadow: "0 0 0 1.5px rgba(255,255,255,0.8)",
    touchAction: "none",
    ...extra,
  });

  const activeKind = active?.kind ?? null;
  const activeSide = active?.side ?? null;

  return (
    <div
      ref={overlayRef}
      aria-hidden
      data-canvas-spacing-overlay=""
      style={{
        position: "fixed",
        // When overlayRef is wired the parent's rAF loop OWNS
        // top/left/width/height (written directly each frame, seeded before
        // first paint), so the box-model overlay tracks scroll/drag without a
        // React re-render. Without overlayRef, position from the rect prop.
        ...(overlayRef
          ? null
          : {
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
            }),
        pointerEvents: "none",
        zIndex: 94,
      }}
    >
      {/* ── Margin zone bands (devtools-style, painted OUTSIDE the box) ──── */}
      {showMargins ? (
        <>
          {margins.top > 0 ? (
            <span
              aria-hidden
              data-canvas-margin-band="top"
              style={{
                position: "absolute",
                left: 0,
                top: -margins.top,
                width: "100%",
                height: margins.top,
                background: MARGIN_FILL,
                pointerEvents: "none",
              }}
            />
          ) : null}
          {margins.bottom > 0 ? (
            <span
              aria-hidden
              data-canvas-margin-band="bottom"
              style={{
                position: "absolute",
                left: 0,
                bottom: -margins.bottom,
                width: "100%",
                height: margins.bottom,
                background: MARGIN_FILL,
                pointerEvents: "none",
              }}
            />
          ) : null}
          {margins.left > 0 ? (
            <span
              aria-hidden
              data-canvas-margin-band="left"
              style={{
                position: "absolute",
                top: 0,
                left: -margins.left,
                width: margins.left,
                height: "100%",
                background: MARGIN_FILL,
                pointerEvents: "none",
              }}
            />
          ) : null}
          {margins.right > 0 ? (
            <span
              aria-hidden
              data-canvas-margin-band="right"
              style={{
                position: "absolute",
                top: 0,
                right: -margins.right,
                width: margins.right,
                height: "100%",
                background: MARGIN_FILL,
                pointerEvents: "none",
              }}
            />
          ) : null}
        </>
      ) : null}

      {/* ── Padding zone bands (painted INSIDE the box) ──────────────────── */}
      <PaddingBand liveEl={liveEl} />

      {/* ── Padding grab bars (inner) ────────────────────────────────────── */}
      {/* Top */}
      <button
        type="button"
        aria-label="Drag to set top padding"
        title="Drag to set top padding"
        data-canvas-spacing-handle="top"
        onPointerDown={(e) => beginPadding("top", e)}
        style={bar({
          top: 5,
          left: "50%",
          transform: "translateX(-50%)",
          width: 26,
          height: 7,
          cursor: "ns-resize",
          opacity: activeKind === "padding" && activeSide === "top" ? 1 : 0.85,
        })}
      />
      {/* Bottom */}
      <button
        type="button"
        aria-label="Drag to set bottom padding"
        title="Drag to set bottom padding"
        data-canvas-spacing-handle="bottom"
        onPointerDown={(e) => beginPadding("bottom", e)}
        style={bar({
          bottom: 5,
          left: "50%",
          transform: "translateX(-50%)",
          width: 26,
          height: 7,
          cursor: "ns-resize",
          opacity: activeKind === "padding" && activeSide === "bottom" ? 1 : 0.85,
        })}
      />
      {/* Left */}
      <button
        type="button"
        aria-label="Drag to set left padding"
        title="Drag to set left padding"
        data-canvas-spacing-handle="left"
        onPointerDown={(e) => beginPadding("left", e)}
        style={bar({
          left: 5,
          top: "50%",
          transform: "translateY(-50%)",
          width: 7,
          height: 26,
          cursor: "ew-resize",
          opacity: activeKind === "padding" && activeSide === "left" ? 1 : 0.85,
        })}
      />
      {/* Right */}
      <button
        type="button"
        aria-label="Drag to set right padding"
        title="Drag to set right padding"
        data-canvas-spacing-handle="right"
        onPointerDown={(e) => beginPadding("right", e)}
        style={bar({
          right: 5,
          top: "50%",
          transform: "translateY(-50%)",
          width: 7,
          height: 26,
          cursor: "ew-resize",
          opacity: activeKind === "padding" && activeSide === "right" ? 1 : 0.85,
        })}
      />

      {/* ── Margin grab bars (outer) ─────────────────────────────────────── */}
      {showMargins ? (
        <>
          <button
            type="button"
            aria-label="Drag to set top margin"
            title="Drag to set top margin"
            data-canvas-margin-handle="top"
            onPointerDown={(e) => beginMargin("top", e)}
            style={marginBar({
              top: -Math.max(margins.top, 9) - 2,
              left: "50%",
              transform: "translateX(-50%)",
              width: 22,
              height: 6,
              cursor: "ns-resize",
              opacity: activeKind === "margin" && activeSide === "top" ? 1 : 0.8,
            })}
          />
          <button
            type="button"
            aria-label="Drag to set bottom margin"
            title="Drag to set bottom margin"
            data-canvas-margin-handle="bottom"
            onPointerDown={(e) => beginMargin("bottom", e)}
            style={marginBar({
              bottom: -Math.max(margins.bottom, 9) - 2,
              left: "50%",
              transform: "translateX(-50%)",
              width: 22,
              height: 6,
              cursor: "ns-resize",
              opacity:
                activeKind === "margin" && activeSide === "bottom" ? 1 : 0.8,
            })}
          />
          <button
            type="button"
            aria-label="Drag to set left margin"
            title="Drag to set left margin"
            data-canvas-margin-handle="left"
            onPointerDown={(e) => beginMargin("left", e)}
            style={marginBar({
              left: -Math.max(margins.left, 9) - 2,
              top: "50%",
              transform: "translateY(-50%)",
              width: 6,
              height: 22,
              cursor: "ew-resize",
              opacity: activeKind === "margin" && activeSide === "left" ? 1 : 0.8,
            })}
          />
          <button
            type="button"
            aria-label="Drag to set right margin"
            title="Drag to set right margin"
            data-canvas-margin-handle="right"
            onPointerDown={(e) => beginMargin("right", e)}
            style={marginBar({
              right: -Math.max(margins.right, 9) - 2,
              top: "50%",
              transform: "translateY(-50%)",
              width: 6,
              height: 22,
              cursor: "ew-resize",
              opacity:
                activeKind === "margin" && activeSide === "right" ? 1 : 0.8,
            })}
          />
        </>
      ) : null}

      {/* Readout */}
      {active ? (
        <span
          style={{
            position: "absolute",
            top: 4,
            left: 4,
            padding: "2px 6px",
            borderRadius: 5,
            background: active.kind === "margin" ? "#5f7290" : accent,
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
          {`${active.side} ${active.kind} ${liveVal}px`}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Passive inner padding fill — paints the four padding bands inside the box by
 * reading the live computed padding. Re-reads on each render (cheap; the
 * overlay only mounts for the selected/hovered node).
 */
function PaddingBand({ liveEl }: { liveEl: HTMLElement | null }) {
  const top = Math.max(0, readComputedPx(liveEl, "paddingTop"));
  const right = Math.max(0, readComputedPx(liveEl, "paddingRight"));
  const bottom = Math.max(0, readComputedPx(liveEl, "paddingBottom"));
  const left = Math.max(0, readComputedPx(liveEl, "paddingLeft"));
  if (top + right + bottom + left === 0) return null;
  return (
    <>
      {top > 0 ? (
        <span
          aria-hidden
          data-canvas-padding-band="top"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: "100%",
            height: top,
            background: PADDING_FILL,
            pointerEvents: "none",
          }}
        />
      ) : null}
      {bottom > 0 ? (
        <span
          aria-hidden
          data-canvas-padding-band="bottom"
          style={{
            position: "absolute",
            left: 0,
            bottom: 0,
            width: "100%",
            height: bottom,
            background: PADDING_FILL,
            pointerEvents: "none",
          }}
        />
      ) : null}
      {left > 0 ? (
        <span
          aria-hidden
          data-canvas-padding-band="left"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: left,
            height: "100%",
            background: PADDING_FILL,
            pointerEvents: "none",
          }}
        />
      ) : null}
      {right > 0 ? (
        <span
          aria-hidden
          data-canvas-padding-band="right"
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: right,
            height: "100%",
            background: PADDING_FILL,
            pointerEvents: "none",
          }}
        />
      ) : null}
    </>
  );
}

/**
 * #25 — passive box-model bands over the HOVERED block (no controls). Mirrors
 * the devtools highlight: warm padding inside, cool margin outside. Purely
 * read-only; never intercepts pointer events. Mounted from the hover overlay so
 * the box model is legible before selecting.
 */
export function BoxModelHoverBands({
  rect,
  liveEl,
}: {
  rect: Rect;
  liveEl: HTMLElement | null;
}) {
  const mTop = Math.max(0, readComputedPx(liveEl, "marginTop"));
  const mRight = Math.max(0, readComputedPx(liveEl, "marginRight"));
  const mBottom = Math.max(0, readComputedPx(liveEl, "marginBottom"));
  const mLeft = Math.max(0, readComputedPx(liveEl, "marginLeft"));
  return (
    <div
      aria-hidden
      data-canvas-boxmodel-hover=""
      style={{
        position: "fixed",
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        pointerEvents: "none",
        zIndex: 86,
      }}
    >
      {mTop > 0 ? (
        <span
          style={{
            position: "absolute",
            left: 0,
            top: -mTop,
            width: "100%",
            height: mTop,
            background: MARGIN_FILL,
          }}
        />
      ) : null}
      {mBottom > 0 ? (
        <span
          style={{
            position: "absolute",
            left: 0,
            bottom: -mBottom,
            width: "100%",
            height: mBottom,
            background: MARGIN_FILL,
          }}
        />
      ) : null}
      {mLeft > 0 ? (
        <span
          style={{
            position: "absolute",
            top: 0,
            left: -mLeft,
            width: mLeft,
            height: "100%",
            background: MARGIN_FILL,
          }}
        />
      ) : null}
      {mRight > 0 ? (
        <span
          style={{
            position: "absolute",
            top: 0,
            right: -mRight,
            width: mRight,
            height: "100%",
            background: MARGIN_FILL,
          }}
        />
      ) : null}
      <PaddingBand liveEl={liveEl} />
    </div>
  );
}
