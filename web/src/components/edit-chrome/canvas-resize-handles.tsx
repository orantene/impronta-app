"use client";

/**
 * Direct manipulation — canvas resize handles (all 8: N/S/E/W + corners).
 *
 * Drag handles on the selected freeform node's bounding box that write the
 * free `style.width` / `style.height` escapes — the same props the inspector
 * fields set — so a designer can size a block by dragging instead of typing a
 * number.
 *
 * WEST/NORTH handles keep the OPPOSITE edge visually planted: resizing an
 * in-flow block from its left edge would normally keep its left edge fixed by
 * layout, so after every preview write we measure where the anchor (the
 * opposite edge, or the centre under ⌥) actually landed and compensate with
 * the `style.translate` escape. Width + translate then commit as ONE patch on
 * release — a single undo step.
 *
 * MODIFIER CONVENTION (one convention across the whole handle set, shared
 * with the rotate + move handles, matching Figma):
 *   ⌘ = disable snapping ("free")
 *   ⇧ = aspect-ratio lock (corner handles)
 *   ⌥ = resize from the centre
 *
 * Snapping (when ⌘ is not held): parent-fraction targets (Full/½/⅔/⅓ on
 * width), the 8px grid, and sibling/parent edge alignment with a guide line.
 * Aspect-locked drags skip length snapping — a snap would fight the ratio.
 *
 * ROTATED elements resize along their OWN axes (the pointer delta is projected
 * through the element's rotation), with edge/fraction snapping and translate
 * compensation disabled there (both are AABB concepts; documented scope).
 *
 * Pure math (handle axes, aspect lock, from-centre rate, min clamp, length
 * snapping, anchor selection) lives in canvas-resize-geometry.ts (unit-tested);
 * this component keeps the event wiring + DOM measurement.
 *
 * Isolated as its own component so its drag state never perturbs the
 * (React-Compiler-strict) selection-layer memoization. Commits on release
 * through the normal patch flow — undo/redo and persistence come for free.
 */

import { useEffect, useRef, useState } from "react";

import {
  collectGuideViewportLines,
  snapToGuideLines,
  type GuideViewportLines,
} from "./canvas-guide-snap";
import { parseTranslate } from "./canvas-move-handle";
import {
  computeResizeDims,
  isCornerHandle,
  RESIZE_EDGE_SNAP,
  RESIZE_MIN_SIZE,
  resizeAnchorFraction,
  snapResizeLength,
  type ResizeHandleId,
} from "./canvas-resize-geometry";
import {
  normalizeAngleDeg,
  parseRotateDeg,
  toLocalAxesDeg,
} from "./canvas-transform-geometry";
import { useMaybeCanvasViewport } from "./canvas-viewport";
import { useEditorLocale } from "./use-editor-locale";

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
  /**
   * Position compensation accumulated while keeping the anchor planted
   * (west/north/centre resizes). Committed in the SAME patch as the size so
   * the whole gesture is one undo step. Omitted when untouched.
   */
  translate?: { x: number; y: number };
}

// Violet alignment-guide colour (one guide language across resize/move/gap).
const ALIGN_GUIDE = "#7c3aed";

const HANDLE_CURSORS: Record<ResizeHandleId, string> = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
};

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
  /** Persist the final size (+ any anchor compensation) on release. */
  onCommit: (dims: ResizeCommit) => void;
  accent?: string;
  /**
   * When provided, the parent owns the overlay box's top/left/width/height
   * (and rotation transform) and writes them imperatively every frame (rAF)
   * so the controls track scroll / drag with no React re-render. This
   * component then stops positioning the overlay from `rect`; it still uses
   * `rect` only as the first-paint fallback size + the readout seed.
   */
  overlayRef?: React.Ref<HTMLDivElement>;
}) {
  const { t } = useEditorLocale();
  const zoom = useMaybeCanvasViewport()?.zoom ?? 1;
  // Which handle is being dragged (null = idle). Held in state so the readout
  // badge + active-handle styling re-render; refs can't be read during render.
  const [activeHandle, setActiveHandle] = useState<ResizeHandleId | null>(null);
  const [liveW, setLiveW] = useState<number>(Math.round(rect.width));
  const [liveH, setLiveH] = useState<number>(Math.round(rect.height));
  // Non-null while the current drag is snapped to a parent target (e.g. "Full").
  const [snapHint, setSnapHint] = useState<string | null>(null);
  // Alignment-guide coordinates (viewport px) when the dragged edge lines up
  // with a sibling/parent edge; null when not snapped to one.
  const [edgeGuide, setEdgeGuide] = useState<{
    vx: number | null;
    hy: number | null;
  }>({ vx: null, hy: null });
  const startRef = useRef<{
    handle: ResizeHandleId;
    x: number;
    y: number;
    /** Layout-px size at grab (offsetWidth/Height — zoom-independent). */
    w: number;
    h: number;
    /** Translate escape at grab (layout px). */
    tx: number;
    ty: number;
    /** Element rotation at grab (deg, normalized). */
    rotation: number;
    zoom: number;
    /** Parent inner width in layout px (fraction targets), 0 = none. */
    parentW: number;
    /** Sibling/parent edge coords (viewport px) for the moving edges. */
    edgeX: number[];
    edgeY: number[];
    /** Operator-placed ruler guides, snapshotted in viewport px (#31 wiring). */
    guideLines: GuideViewportLines;
    /** Anchor viewport positions at grab: opposite-edge and centre. */
    anchorEdge: { x: number; y: number };
    anchorCenter: { x: number; y: number };
  } | null>(null);
  const latestRef = useRef<{
    w: number;
    h: number;
    tx: number;
    ty: number;
    translateTouched: boolean;
  }>({ w: rect.width, h: rect.height, tx: 0, ty: 0, translateTouched: false });

  useEffect(() => {
    if (!activeHandle) return;
    const onMove = (e: PointerEvent) => {
      const start = startRef.current;
      if (!start || !liveEl) return;
      const free = e.metaKey || e.ctrlKey;
      const fromCenter = e.altKey;
      const aspect = e.shiftKey && isCornerHandle(start.handle);
      // Pointer travel in the element's LOCAL layout axes: screen px ÷ zoom,
      // projected through the element's rotation.
      const local = toLocalAxesDeg(
        (e.clientX - start.x) / start.zoom,
        (e.clientY - start.y) / start.zoom,
        start.rotation,
      );
      const dims = computeResizeDims({
        handle: start.handle,
        startW: start.w,
        startH: start.h,
        dxLocal: local.x,
        dyLocal: local.y,
        aspectLock: aspect,
        fromCenter,
      });
      let w = dims.w;
      let h = dims.h;
      let snapLabel: string | null = null;
      let guideVx: number | null = null;
      let guideHy: number | null = null;
      const rotated = start.rotation !== 0;
      // Length snapping — skipped when ⌘-free or aspect-locked (a snap would
      // fight the locked ratio).
      if (!aspect) {
        if (dims.affectsX) {
          const targets = start.parentW
            ? [
                { value: start.parentW, label: "Full" },
                { value: start.parentW / 2, label: "½" },
                { value: (start.parentW * 2) / 3, label: "⅔" },
                { value: start.parentW / 3, label: "⅓" },
              ]
            : [];
          const snapped = snapResizeLength(w, free, rotated ? [] : targets);
          w = Math.max(RESIZE_MIN_SIZE, snapped.value);
          if (snapped.label) snapLabel = snapped.label;
          // Edge alignment: snap the MOVING edge's viewport X to the nearest
          // sibling/parent edge and draw a vertical guide there. AABB concept —
          // skipped when rotated or resizing from the centre (both edges move).
          if (!free && !snapped.label && !rotated && !fromCenter) {
            const dir = start.handle.includes("e") ? 1 : -1;
            const movingX = start.anchorEdge.x + dir * w * start.zoom;
            let best: { coord: number; d: number } | null = null;
            for (const coord of start.edgeX) {
              const d = Math.abs(coord - movingX);
              if (d <= RESIZE_EDGE_SNAP && (!best || d < best.d)) best = { coord, d };
            }
            if (best) {
              w = Math.max(
                RESIZE_MIN_SIZE,
                Math.round((dir * (best.coord - start.anchorEdge.x)) / start.zoom),
              );
              guideVx = best.coord;
            }
            // #31 wiring — operator-placed vertical guides as snap targets for
            // the moving edge (via findGuideSnap), when no sibling edge won.
            if (!best && start.guideLines.v.length > 0) {
              const snap = snapToGuideLines(
                movingX,
                start.guideLines.v,
                "y",
                RESIZE_EDGE_SNAP,
              );
              if (snap.guide !== null) {
                w = Math.max(
                  RESIZE_MIN_SIZE,
                  Math.round(
                    (dir * (snap.guide - start.anchorEdge.x)) / start.zoom,
                  ),
                );
                guideVx = snap.guide;
              }
            }
          }
        }
        if (dims.affectsY) {
          const snapped = snapResizeLength(h, free, []);
          h = Math.max(RESIZE_MIN_SIZE, snapped.value);
          if (!free && !rotated && !fromCenter) {
            const dir = start.handle.includes("s") ? 1 : -1;
            const movingY = start.anchorEdge.y + dir * h * start.zoom;
            let best: { coord: number; d: number } | null = null;
            for (const coord of start.edgeY) {
              const d = Math.abs(coord - movingY);
              if (d <= RESIZE_EDGE_SNAP && (!best || d < best.d)) best = { coord, d };
            }
            if (best) {
              h = Math.max(
                RESIZE_MIN_SIZE,
                Math.round((dir * (best.coord - start.anchorEdge.y)) / start.zoom),
              );
              guideHy = best.coord;
            }
            // #31 wiring — horizontal guides for the moving edge.
            if (!best && start.guideLines.h.length > 0) {
              const snap = snapToGuideLines(
                movingY,
                start.guideLines.h,
                "x",
                RESIZE_EDGE_SNAP,
              );
              if (snap.guide !== null) {
                h = Math.max(
                  RESIZE_MIN_SIZE,
                  Math.round(
                    (dir * (snap.guide - start.anchorEdge.y)) / start.zoom,
                  ),
                );
                guideHy = snap.guide;
              }
            }
          }
        }
      }
      // Instant preview — the committed props re-apply the same values on
      // release, so there is no visible snap.
      if (dims.affectsX) liveEl.style.width = `${w}px`;
      if (dims.affectsY) liveEl.style.height = `${h}px`;
      latestRef.current.w = w;
      latestRef.current.h = h;
      // ANCHOR COMPENSATION — keep the opposite edge (or the centre under ⌥)
      // visually planted by adjusting the translate escape after measuring
      // where the anchor actually landed. Skipped for rotated elements (the
      // anchor sample is an AABB point there).
      if (!rotated) {
        const af = resizeAnchorFraction(start.handle, fromCenter);
        const target = fromCenter ? start.anchorCenter : start.anchorEdge;
        const r2 = liveEl.getBoundingClientRect();
        const nowX = r2.left + af.fx * r2.width;
        const nowY = r2.top + af.fy * r2.height;
        const dxFix = (target.x - nowX) / start.zoom;
        const dyFix = (target.y - nowY) / start.zoom;
        // Dead-band so handles whose anchor never moves (E/S/SE in normal
        // flow) don't jitter the translate by subpixel measurement noise.
        if (Math.abs(dxFix) >= 0.5 || Math.abs(dyFix) >= 0.5) {
          const tx = Math.round(latestRef.current.tx + dxFix);
          const ty = Math.round(latestRef.current.ty + dyFix);
          latestRef.current.tx = tx;
          latestRef.current.ty = ty;
          latestRef.current.translateTouched = true;
          liveEl.style.translate = `${tx}px ${ty}px`;
        }
      }
      setLiveW(w);
      setLiveH(h);
      setSnapHint(snapLabel);
      setEdgeGuide({ vx: guideVx, hy: guideHy });
    };
    const onUp = () => {
      const start = startRef.current;
      const latest = latestRef.current;
      const dims: ResizeCommit = {};
      if (start) {
        const affectsX = start.handle.includes("e") || start.handle.includes("w");
        const affectsY = start.handle.includes("n") || start.handle.includes("s");
        if (affectsX) dims.width = latest.w;
        if (affectsY) dims.height = latest.h;
        if (latest.translateTouched) {
          dims.translate = { x: latest.tx, y: latest.ty };
        }
      }
      onCommit(dims);
      setActiveHandle(null);
      setSnapHint(null);
      setEdgeGuide({ vx: null, hy: null });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [activeHandle, liveEl, onCommit]);

  function begin(handle: ResizeHandleId, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!liveEl) return;
    const computed = getComputedStyle(liveEl);
    const rotation = normalizeAngleDeg(parseRotateDeg(computed.rotate));
    const translate = parseTranslate(computed.translate);
    const er = liveEl.getBoundingClientRect();
    const af = resizeAnchorFraction(handle, false);
    // Sibling + parent edge coordinates, captured once on grab (they don't
    // move while WE resize). Any moving edge can snap to a sibling's
    // left/right (top/bottom) or the parent's inner edges.
    const edgeX: number[] = [];
    const edgeY: number[] = [];
    const parentNode = liveEl.parentElement;
    let parentW = 0;
    if (parentNode) {
      const pr = parentNode.getBoundingClientRect();
      parentW = pr.width / zoom;
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
      handle,
      x: e.clientX,
      y: e.clientY,
      w: liveEl.offsetWidth,
      h: liveEl.offsetHeight,
      tx: translate.x,
      ty: translate.y,
      rotation,
      zoom,
      parentW,
      edgeX,
      edgeY,
      // #31 wiring — guides can't move mid-drag; one snapshot is exact.
      guideLines: collectGuideViewportLines(),
      anchorEdge: {
        x: er.left + af.fx * er.width,
        y: er.top + af.fy * er.height,
      },
      anchorCenter: {
        x: er.left + er.width / 2,
        y: er.top + er.height / 2,
      },
    };
    latestRef.current = {
      w: liveEl.offsetWidth,
      h: liveEl.offsetHeight,
      tx: translate.x,
      ty: translate.y,
      translateTouched: false,
    };
    setLiveW(liveEl.offsetWidth);
    setLiveH(liveEl.offsetHeight);
    setSnapHint(null);
    setEdgeGuide({ vx: null, hy: null });
    setActiveHandle(handle);
  }

  // Double-click a handle to clear its fixed dimension(s) back to auto — the
  // standard "un-fix a size" gesture. The inline preview style is cleared by
  // the commit handler (which owns a non-prop reference to the element).
  function reset(handle: ResizeHandleId) {
    const dims: ResizeCommit = {};
    if (handle.includes("e") || handle.includes("w")) dims.width = null;
    if (handle.includes("n") || handle.includes("s")) dims.height = null;
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

  const activeShadow =
    "0 0 0 3px rgba(124,58,237,0.25), 0 2px 6px rgba(0,0,0,0.35)";

  const edgeHandle = (
    handle: "n" | "s" | "e" | "w",
    pos: React.CSSProperties,
  ) => (
    <button
      key={handle}
      type="button"
      aria-label={
        handle === "e" || handle === "w"
          ? t("Drag to resize width (double-click to reset)")
          : t("Drag to resize height (double-click to reset)")
      }
      title={t("Drag to resize · double-click to reset")}
      data-canvas-resize-handle={handle}
      onPointerDown={(e) => begin(handle, e)}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        reset(handle);
      }}
      style={pill({
        ...pos,
        borderRadius: 6,
        cursor: HANDLE_CURSORS[handle],
        boxShadow: activeHandle === handle ? activeShadow : undefined,
      })}
    />
  );

  const cornerHandle = (
    handle: "ne" | "nw" | "se" | "sw",
    pos: React.CSSProperties,
  ) => (
    <button
      key={handle}
      type="button"
      aria-label={t("Drag to resize width and height (double-click to reset)")}
      title={t("Drag to resize · double-click to reset")}
      data-canvas-resize-handle={handle}
      onPointerDown={(e) => begin(handle, e)}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        reset(handle);
      }}
      style={pill({
        ...pos,
        width: 14,
        height: 14,
        borderRadius: 4,
        cursor: HANDLE_CURSORS[handle],
        boxShadow: activeHandle === handle ? activeShadow : undefined,
      })}
    />
  );

  const readoutHint =
    activeHandle && isCornerHandle(activeHandle)
      ? t("⌘ free · ⇧ aspect · ⌥ center")
      : t("⌘ free · ⌥ center");

  return (
    <>
      {/* Resize alignment guides. A violet line at the sibling/parent edge the
       *  dragged edge has snapped to. Drawn in viewport coords (outside the
       *  rect-offset overlay) spanning the axis so the line-up reads at a
       *  glance. */}
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
          // top/left/width/height (+ the rotation transform), seeded
          // synchronously before first paint via useLayoutEffect, so the box
          // tracks scroll/drag with no React re-render and never trails.
          // Without overlayRef, fall back to positioning from the rect prop.
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
        {/* Edge handles — E/W set width, N/S set height. */}
        {edgeHandle("e", {
          top: "50%",
          right: -6,
          transform: "translateY(-50%)",
          width: 11,
          height: 30,
        })}
        {edgeHandle("w", {
          top: "50%",
          left: -6,
          transform: "translateY(-50%)",
          width: 11,
          height: 30,
        })}
        {edgeHandle("s", {
          left: "50%",
          bottom: -6,
          transform: "translateX(-50%)",
          width: 30,
          height: 11,
        })}
        {edgeHandle("n", {
          left: "50%",
          top: -6,
          transform: "translateX(-50%)",
          width: 30,
          height: 11,
        })}
        {/* Corner handles — width + height together. */}
        {cornerHandle("se", { right: -7, bottom: -7 })}
        {cornerHandle("sw", { left: -7, bottom: -7 })}
        {cornerHandle("ne", { right: -7, top: -7 })}
        {cornerHandle("nw", { left: -7, top: -7 })}
        {/* Live size readout while dragging — W×H + the shared modifier-hint
         *  line (⌘ free / ⇧ aspect on corners / ⌥ from centre). */}
        {activeHandle ? (
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
              {(activeHandle === "e" || activeHandle === "w"
                ? `${liveW}px`
                : activeHandle === "n" || activeHandle === "s"
                  ? `${liveH}px`
                  : `${liveW} × ${liveH}`) +
                (snapHint ? `  ·  ${snapHint}` : "")}
            </span>
            <span style={{ fontWeight: 600, opacity: 0.78, fontSize: 9 }}>
              {readoutHint}
            </span>
          </span>
        ) : null}
      </div>
    </>
  );
}
