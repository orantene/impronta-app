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
 * once on release through the normal patch flow. 8px grid snap; ⌘ = free
 * (the shared modifier convention across the handle set — see
 * canvas-resize-geometry.ts).
 */

import { useEffect, useRef, useState } from "react";

import { useEditorLocale } from "./use-editor-locale";

import {
  equalSpacingSnapDelta,
  findEqualSpacing,
  type GuideBox,
  type SpacingGuide,
} from "./canvas-align-guides";
import {
  collectGuideViewportLines,
  GUIDE_SNAP_HIGHLIGHT,
  snapToGuideLines,
  type GuideViewportLines,
} from "./canvas-guide-snap";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const GRID = 8;
// Pointer distance within which the dragged block snaps its centre to the
// parent's centre (and shows an alignment guide), Figma/Webflow-style.
const ALIGN = 6;
// Pointer distance within which the move softly snaps to an EQUAL-SPACING
// (distribution) position between the nearest siblings on an axis.
const SPACING_SNAP = 6;
// Boxes roomier than this get the grip at their CENTRE. Smaller boxes still
// get a grip — a 40px logo is exactly the block an operator most needs to
// nudge — but it pins just OUTSIDE the bottom edge so a centre control never
// swamps the content (owner report, 2026-08-20: sub-64px blocks had NO move
// affordance at all, so a small element could not be repositioned until it
// was first resized larger).
const MIN_BOX = 64;
// Clearance for the outside grip on small boxes: past the ring plus the
// edge-centre resize pill (11×30, centred on the edge → ~6px proud). The grip
// sits BESIDE the box (left by default) because the selection chip anchors
// above/below it — a below-the-box grip landed inside the chip whenever the
// chip flipped under a near-the-top element (the site-shell logo, exactly).
const SMALL_GRIP_OFFSET = 18;
// 4A #8 — teal for equal-spacing (distribution) pills; magenta-ish accent for
// edge/centre alignment stays the caller-supplied `accent`. Matches the
// Violet distribution-cue colour (one guide language across resize/move/gap).
const SPACING_GUIDE = "#7c3aed";

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function parseTranslate(value: string): { x: number; y: number } {
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
  accent = "#7c3aed",
  overlayRef,
}: {
  rect: Rect;
  liveEl: HTMLElement | null;
  onCommitTranslate: (x: number, y: number) => void;
  accent?: string;
  /**
   * When provided, the parent owns the move-grip overlay box's
   * top/left/width/height and writes them imperatively each frame (rAF) so the
   * grip tracks scroll / drag with no React re-render. The centre grip is
   * positioned RELATIVE to this box (50% + translate), so it rides along. The
   * alignment guides / spacing pills below are drawn in viewport coords and are
   * only present DURING a drag (their own local state), so they don't track
   * scroll and need no ref.
   */
  overlayRef?: React.Ref<HTMLDivElement>;
}) {
  const { t } = useEditorLocale();
  const [dragging, setDragging] = useState(false);
  const [live, setLive] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  // Alignment-guide lines + equal-spacing pills (viewport coords) shown while
  // the dragged block is snapped to a sibling/parent edge or an even gap.
  const [guides, setGuides] = useState<{
    v: number | null;
    h: number | null;
    parent: Box | null;
    spacing: ReadonlyArray<SpacingGuide>;
    // Operator-placed ruler guides the block is currently snapped to
    // (viewport px), highlighted full-viewport in the guides' own blue.
    userV: number | null;
    userH: number | null;
  }>({ v: null, h: null, parent: null, spacing: [], userV: null, userH: null });
  const startRef = useRef<{
    px: number;
    py: number;
    x: number;
    y: number;
    natCx: number;
    natCy: number;
    // Natural (untranslated) top-left, so a candidate translate maps to a full
    // box for the equal-spacing geometry.
    natLeft: number;
    natTop: number;
    width: number;
    height: number;
    halfW: number;
    halfH: number;
    parent: Box | null;
    // Snap coordinates (viewport px) gathered from the parent + every sibling:
    // each is a left/centre/right (X) or top/middle/bottom (Y) the block can
    // align an edge to.
    snapX: number[];
    snapY: number[];
    // Full sibling boxes (captured once on grab — siblings don't move) for the
    // equal-spacing distribution maths.
    sibBoxes: GuideBox[];
    // Operator-placed ruler guides, snapshotted in viewport px (#31 wiring).
    guideLines: GuideViewportLines;
  } | null>(null);
  const latestRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const start = startRef.current;
      if (!start) return;
      // ⌘ = free (shared modifier convention across the handle set).
      const free = e.metaKey || e.ctrlKey;
      const snap = (v: number) =>
        free ? Math.round(v) : Math.round(v / GRID) * GRID;
      let x = snap(start.x + (e.clientX - start.px));
      let y = snap(start.y + (e.clientY - start.py));
      // Align any of the block's three edges (left/centre/right on X,
      // top/middle/bottom on Y) to any parent- or sibling-derived snap
      // coordinate, drawing a guide at the match. Closest wins (⌘ skips).
      let gv: number | null = null;
      let gh: number | null = null;
      let uv: number | null = null;
      let uh: number | null = null;
      if (!free) {
        // The block's edge anchor positions as a function of translate 0.
        const xAnchors = [
          start.natCx - start.halfW,
          start.natCx,
          start.natCx + start.halfW,
        ];
        const yAnchors = [
          start.natCy - start.halfH,
          start.natCy,
          start.natCy + start.halfH,
        ];
        let bestX: { guide: number; tx: number; d: number } | null = null;
        for (const coord of start.snapX) {
          for (const anchor of xAnchors) {
            const tx = coord - anchor;
            const d = Math.abs(tx - x);
            if (d <= ALIGN && (!bestX || d < bestX.d))
              bestX = { guide: coord, tx, d };
          }
        }
        if (bestX) {
          x = Math.round(bestX.tx);
          gv = bestX.guide;
        }
        let bestY: { guide: number; ty: number; d: number } | null = null;
        for (const coord of start.snapY) {
          for (const anchor of yAnchors) {
            const ty = coord - anchor;
            const d = Math.abs(ty - y);
            if (d <= ALIGN && (!bestY || d < bestY.d))
              bestY = { guide: coord, ty, d };
          }
        }
        if (bestY) {
          y = Math.round(bestY.ty);
          gh = bestY.guide;
        }
        // #31 wiring — operator-placed ruler guides as snap targets (via the
        // previously dead findGuideSnap). Sibling/parent edge alignment wins
        // (the stronger, content-derived cue); an unclaimed axis then snaps
        // any of the block's three edge anchors to the nearest guide line.
        if (gv === null && start.guideLines.v.length > 0) {
          let best: { tx: number; line: number; d: number } | null = null;
          for (const anchor of xAnchors) {
            const p = anchor + x;
            const s = snapToGuideLines(p, start.guideLines.v, "y", ALIGN);
            if (s.guide === null) continue;
            const d = Math.abs(s.pos - p);
            if (!best || d < best.d) best = { tx: x + (s.pos - p), line: s.guide, d };
          }
          if (best) {
            x = Math.round(best.tx);
            uv = best.line;
          }
        }
        if (gh === null && start.guideLines.h.length > 0) {
          let best: { ty: number; line: number; d: number } | null = null;
          for (const anchor of yAnchors) {
            const p = anchor + y;
            const s = snapToGuideLines(p, start.guideLines.h, "x", ALIGN);
            if (s.guide === null) continue;
            const d = Math.abs(s.pos - p);
            if (!best || d < best.d) best = { ty: y + (s.pos - p), line: s.guide, d };
          }
          if (best) {
            y = Math.round(best.ty);
            uh = best.line;
          }
        }
      }
      // 4A #8 — equal-spacing (distribution). On an axis NOT already claimed by
      // a hard edge alignment, softly pull toward the position where the gaps
      // to the nearest siblings on each side are equal, and draw teal gap pills
      // there. Edge alignment (above) takes priority — it's the stronger cue.
      const spacing: SpacingGuide[] = [];
      if (!free && start.sibBoxes.length > 0) {
        const boxAt = (tx: number, ty: number): GuideBox => ({
          left: start.natLeft + tx,
          top: start.natTop + ty,
          width: start.width,
          height: start.height,
        });
        if (gv === null && uv === null) {
          const delta = equalSpacingSnapDelta({
            dragged: boxAt(x, y),
            siblings: start.sibBoxes,
            axis: "x",
            tol: SPACING_SNAP,
          });
          if (delta !== null) x = Math.round(x + delta);
        }
        if (gh === null && uh === null) {
          const delta = equalSpacingSnapDelta({
            dragged: boxAt(x, y),
            siblings: start.sibBoxes,
            axis: "y",
            tol: SPACING_SNAP,
          });
          if (delta !== null) y = Math.round(y + delta);
        }
        // After any snap, re-test at the final position to decide which pills
        // to draw (only when genuinely balanced).
        const finalBox = boxAt(x, y);
        for (const axis of ["x", "y"] as const) {
          const match = findEqualSpacing({
            dragged: finalBox,
            siblings: start.sibBoxes,
            axis,
            tol: 1,
          });
          if (match) spacing.push(match);
        }
      }
      latestRef.current = { x, y };
      setLive({ x, y });
      setGuides({
        v: gv,
        h: gh,
        parent: start.parent,
        spacing,
        userV: uv,
        userH: uh,
      });
      if (liveEl) liveEl.style.translate = `${x}px ${y}px`;
    };
    const onUp = () => {
      onCommitTranslate(latestRef.current.x, latestRef.current.y);
      setDragging(false);
      setGuides({
        v: null,
        h: null,
        parent: null,
        spacing: [],
        userV: null,
        userH: null,
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, liveEl, onCommitTranslate]);

  const smallBox = rect.width < MIN_BOX || rect.height < MIN_BOX;
  // Flip to the right side when the box hugs the viewport's left edge.
  const smallGripSide: "left" | "right" =
    rect.left < SMALL_GRIP_OFFSET + 30 ? "right" : "left";

  function begin(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const current = liveEl
      ? parseTranslate(getComputedStyle(liveEl).translate)
      : { x: 0, y: 0 };
    // Natural (untranslated) centre = current centre minus the applied
    // translate — the fixed anchor the alignment maths references.
    const er = liveEl?.getBoundingClientRect();
    const natCx = er ? er.left + er.width / 2 - current.x : 0;
    const natCy = er ? er.top + er.height / 2 - current.y : 0;
    const natLeft = er ? er.left - current.x : 0;
    const natTop = er ? er.top - current.y : 0;
    const width = er ? er.width : 0;
    const height = er ? er.height : 0;
    const halfW = er ? er.width / 2 : 0;
    const halfH = er ? er.height / 2 : 0;
    const pr = liveEl?.parentElement?.getBoundingClientRect();
    const parent: Box | null = pr
      ? { top: pr.top, left: pr.left, width: pr.width, height: pr.height }
      : null;
    // Gather snap coordinates: the parent's left/centre/right + top/middle/
    // bottom, plus the same three edges of every sibling element. Siblings
    // don't move during the drag, so capturing once on grab is sufficient.
    const snapX: number[] = [];
    const snapY: number[] = [];
    const sibBoxes: GuideBox[] = [];
    if (pr) {
      snapX.push(pr.left, pr.left + pr.width / 2, pr.left + pr.width);
      snapY.push(pr.top, pr.top + pr.height / 2, pr.top + pr.height);
    }
    const parentNode = liveEl?.parentElement;
    if (parentNode) {
      for (const sib of Array.from(parentNode.children)) {
        if (sib === liveEl || !(sib instanceof HTMLElement)) continue;
        const sr = sib.getBoundingClientRect();
        if (sr.width === 0 && sr.height === 0) continue;
        snapX.push(sr.left, sr.left + sr.width / 2, sr.left + sr.width);
        snapY.push(sr.top, sr.top + sr.height / 2, sr.top + sr.height);
        sibBoxes.push({
          left: sr.left,
          top: sr.top,
          width: sr.width,
          height: sr.height,
        });
      }
    }
    startRef.current = {
      px: e.clientX,
      py: e.clientY,
      x: current.x,
      y: current.y,
      natCx,
      natCy,
      natLeft,
      natTop,
      width,
      height,
      halfW,
      halfH,
      parent,
      snapX,
      snapY,
      sibBoxes,
      // #31 wiring — operator-placed guides can't move mid-drag, so one
      // viewport snapshot at grab is exact for the whole gesture.
      guideLines: collectGuideViewportLines(),
    };
    latestRef.current = current;
    setLive({ x: Math.round(current.x), y: Math.round(current.y) });
    setGuides({
      v: null,
      h: null,
      parent: null,
      spacing: [],
      userV: null,
      userH: null,
    });
    setDragging(true);
  }

  return (
    <>
    {/* Alignment guides — drawn across the parent when the centre snaps. */}
    {guides.parent && guides.v !== null ? (
      <div
        aria-hidden
        data-canvas-align-guide="v"
        style={{
          position: "fixed",
          left: guides.v,
          top: guides.parent.top,
          width: 0,
          height: guides.parent.height,
          borderLeft: `1px dashed ${accent}`,
          pointerEvents: "none",
          zIndex: 97,
        }}
      />
    ) : null}
    {guides.parent && guides.h !== null ? (
      <div
        aria-hidden
        data-canvas-align-guide="h"
        style={{
          position: "fixed",
          top: guides.h,
          left: guides.parent.left,
          height: 0,
          width: guides.parent.width,
          borderTop: `1px dashed ${accent}`,
          pointerEvents: "none",
          zIndex: 97,
        }}
      />
    ) : null}
    {/* #31 wiring — operator-guide snap highlight: a solid full-viewport line
     *  in the guides' own active blue, drawn over the guide the block is
     *  snapped to so the capture reads unmistakably as "your guide". */}
    {guides.userV !== null ? (
      <div
        aria-hidden
        data-canvas-user-guide-snap="v"
        style={{
          position: "fixed",
          left: guides.userV,
          top: 0,
          width: 0,
          height: "100vh",
          borderLeft: `1px solid ${GUIDE_SNAP_HIGHLIGHT}`,
          pointerEvents: "none",
          zIndex: 97,
        }}
      />
    ) : null}
    {guides.userH !== null ? (
      <div
        aria-hidden
        data-canvas-user-guide-snap="h"
        style={{
          position: "fixed",
          top: guides.userH,
          left: 0,
          height: 0,
          width: "100vw",
          borderTop: `1px solid ${GUIDE_SNAP_HIGHLIGHT}`,
          pointerEvents: "none",
          zIndex: 97,
        }}
      />
    ) : null}
    {/* 4A #8 — equal-spacing (distribution) pills. Teal bars span each of the
     *  two equal gaps with an end-tick, the universal "these spaces match"
     *  cue. Drawn only when the block is genuinely balanced between its
     *  nearest siblings on the axis. */}
    {guides.spacing.flatMap((guide) =>
      guide.bands.map((band, i) => {
        const horizontal = guide.axis === "x";
        const length = Math.max(0, band.to - band.from);
        return (
          <div
            key={`sp-${guide.axis}-${i}`}
            aria-hidden
            data-canvas-spacing-guide={guide.axis}
            style={{
              position: "fixed",
              ...(horizontal
                ? {
                    left: band.from,
                    top: guide.cross,
                    width: length,
                    height: 0,
                    borderTop: `2px solid ${SPACING_GUIDE}`,
                  }
                : {
                    top: band.from,
                    left: guide.cross,
                    height: length,
                    width: 0,
                    borderLeft: `2px solid ${SPACING_GUIDE}`,
                  }),
              pointerEvents: "none",
              zIndex: 97,
            }}
          >
            {/* end ticks at both ends of the gap band */}
            <span
              style={{
                position: "absolute",
                ...(horizontal
                  ? { left: -1, top: -4, width: 0, height: 8, borderLeft: `2px solid ${SPACING_GUIDE}` }
                  : { top: -1, left: -4, height: 0, width: 8, borderTop: `2px solid ${SPACING_GUIDE}` }),
              }}
            />
            <span
              style={{
                position: "absolute",
                ...(horizontal
                  ? { right: -1, top: -4, width: 0, height: 8, borderLeft: `2px solid ${SPACING_GUIDE}` }
                  : { bottom: -1, left: -4, height: 0, width: 8, borderTop: `2px solid ${SPACING_GUIDE}` }),
              }}
            />
          </div>
        );
      }),
    )}
    <div
      ref={overlayRef}
      aria-hidden
      data-canvas-move-overlay=""
      style={{
        position: "fixed",
        // When overlayRef is wired the parent's rAF loop OWNS
        // top/left/width/height (written directly each frame, seeded before
        // first paint), so the grip box tracks scroll/drag without a React
        // re-render. Without overlayRef, position from the rect prop.
        ...(overlayRef
          ? null
          : {
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
            }),
        pointerEvents: "none",
        zIndex: 96,
      }}
    >
      <button
        type="button"
        aria-label="Drag to move (double-click to reset position)"
        title="Drag to move · double-click to snap back to natural position"
        data-canvas-move-handle=""
        data-canvas-move-handle-placement={smallBox ? "outside" : "center"}
        onPointerDown={begin}
        onDoubleClick={(e) => {
          // Recover a strayed block: reset its translate to 0,0 (natural
          // position). The commit path drops the translate entirely at 0,0,
          // restoring the block on every breakpoint.
          e.preventDefault();
          e.stopPropagation();
          onCommitTranslate(0, 0);
        }}
        style={{
          position: "absolute",
          // Small boxes: grip sits beside the box (edge-centred) so it never
          // covers the content and stays clear of the chip's above/below band;
          // roomy boxes keep the familiar centre grip.
          top: "50%",
          ...(smallBox
            ? smallGripSide === "left"
              ? { right: `calc(100% + ${SMALL_GRIP_OFFSET}px)` }
              : { left: `calc(100% + ${SMALL_GRIP_OFFSET}px)` }
            : { left: "50%" }),
          transform: smallBox ? "translateY(-50%)" : "translate(-50%, -50%)",
          width: smallBox ? 22 : 26,
          height: smallBox ? 22 : 26,
          borderRadius: 7,
          background: dragging ? accent : "rgba(124,58,237,0.55)",
          border: "2px solid #ffffff",
          boxShadow: dragging
            ? "0 0 0 3px rgba(124,58,237,0.25), 0 2px 6px rgba(0,0,0,0.35)"
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
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
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
          {/* live offset + a one-line modifier hint (W3-T6). ⌘ bypasses the
           *  grid snap + sibling align ("free") — the only modifier this handle
           *  implements, so the only one advertised. */}
          <span>{`move ${live.x}, ${live.y}`}</span>
          <span style={{ fontWeight: 600, opacity: 0.78, fontSize: 9 }}>
            {t("⌘ free")}
          </span>
        </span>
      ) : null}
    </div>
    </>
  );
}
