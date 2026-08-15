"use client";

/**
 * Direct manipulation — canvas ROTATION handle (the Figma corner-zone pattern).
 *
 * Four invisible grab zones sit just OUTSIDE the selection box corners (the
 * standard 2026 pattern: move the cursor slightly past a corner and it becomes
 * a curved-arrow rotate cursor). Dragging one rotates the element around its
 * visual centre by writing the non-destructive `style.rotate` escape (CSS
 * `rotate`, e.g. "15deg") — the same escape the Style panel's transform fields
 * set, so canvas drag and panel field stay one value.
 *
 * Corner zones were chosen over a top-centre stem grip because they need no
 * extra visible chrome (the selection box is already crowded with resize +
 * spacing + move handles) and they scale to small elements where a stem would
 * collide with the N resize handle added in this same pack.
 *
 * Same mechanism as the move/resize handles: read the live angle on grab,
 * preview by writing the element's inline style during the drag, commit ONCE
 * on release through the normal patch flow (undo/redo for free). Rotating back
 * to 0 deletes the escape entirely (see commitSelectedNodeRotate).
 *
 * MAGNET: snaps to the 8 compass angles (0/45/90/…) within ±5°. Modifier
 * convention (shared by the whole handle set): ⌘ = free (no snapping),
 * ⇧ = fine 15° steps. Math lives in canvas-transform-geometry.ts (unit-tested,
 * including a negative test pinning the ±5° tolerance).
 *
 * The parent overlay box is rAF-positioned by selection-layer (overlayRef) and
 * receives the element's own rotation as a CSS transform, so these corner
 * zones ride the rotated selection ring exactly.
 */

import { useEffect, useRef, useState } from "react";

import {
  normalizeAngleDeg,
  parseRotateDeg,
  pointerAngleDeg,
  snapRotationDeg,
} from "./canvas-transform-geometry";
import { useEditorLocale } from "./use-editor-locale";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

// Square size of each corner rotate zone (px) and how far outside the corner
// it sits. The zones deliberately do NOT overlap the resize corner handles
// (±7px around the corner): they start 6px outside the box edge.
const ZONE_SIZE = 22;
const ZONE_OFFSET = -(ZONE_SIZE + 6);

// Curved-arrow rotate cursor (encoded SVG) — the platform has no standard
// rotate cursor, so ship one, with a crosshair fallback.
const ROTATE_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24'%3E%3Cpath d='M12 4a8 8 0 1 1-7.4 4.9' fill='none' stroke='%23000' stroke-width='3.4' stroke-linecap='round'/%3E%3Cpath d='M12 4a8 8 0 1 1-7.4 4.9' fill='none' stroke='%23fff' stroke-width='1.8' stroke-linecap='round'/%3E%3Cpath d='M5.8 3.2 4.3 9.5l6.3-1.6z' fill='%23000'/%3E%3Cpath d='M6.1 4.4 5.1 8.6l4.2-1.1z' fill='%23fff'/%3E%3C/svg%3E") 9 9, crosshair`;

export function CanvasRotateHandle({
  rect,
  liveEl,
  onCommitRotate,
  accent = "#7c3aed",
  overlayRef,
}: {
  /** Selected element's viewport rect — first-paint fallback position. */
  rect: Rect;
  /** The selected DOM element — rotated inline for a live preview. */
  liveEl: HTMLElement | null;
  /** Persist the final angle (deg, normalized) through the patch flow. */
  onCommitRotate: (deg: number) => void;
  accent?: string;
  /**
   * When provided, selection-layer's rAF loop owns the overlay box's
   * top/left/width/height (and its rotation transform), so the corner zones
   * track scroll / drag / live rotation with no React re-render.
   */
  overlayRef?: React.Ref<HTMLDivElement>;
}) {
  const { t } = useEditorLocale();
  const [dragging, setDragging] = useState(false);
  const [live, setLive] = useState<{ deg: number; snapped: boolean }>({
    deg: 0,
    snapped: false,
  });
  const [cursor, setCursor] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const startRef = useRef<{
    cx: number;
    cy: number;
    startDeg: number;
    pointerDeg: number;
  } | null>(null);
  const latestRef = useRef<number>(0);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const start = startRef.current;
      if (!start) return;
      const raw =
        start.startDeg +
        (pointerAngleDeg(e.clientX, e.clientY, start.cx, start.cy) -
          start.pointerDeg);
      const snap = snapRotationDeg({
        raw,
        disableSnap: e.metaKey || e.ctrlKey,
        fineStep: e.shiftKey,
      });
      latestRef.current = snap.deg;
      setLive(snap);
      setCursor({ x: e.clientX, y: e.clientY });
      // Instant preview; the committed prop re-applies the same value on
      // release, so there is no visible jump. Style-attribute mutation also
      // primes the selection-layer geometry loop, so the rotated ring tracks.
      if (liveEl) liveEl.style.rotate = `${snap.deg}deg`;
    };
    const onUp = () => {
      onCommitRotate(latestRef.current);
      setDragging(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, liveEl, onCommitRotate]);

  function begin(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!liveEl) return;
    const er = liveEl.getBoundingClientRect();
    // Pivot = visual centre of the (possibly already rotated) element. The
    // AABB centre equals the quad centre for any transform-origin, so this is
    // the stable reference even when a custom transformOrigin escape is set —
    // only angle DIFFERENCES are measured against it.
    const cx = er.left + er.width / 2;
    const cy = er.top + er.height / 2;
    const startDeg = normalizeAngleDeg(
      parseRotateDeg(getComputedStyle(liveEl).rotate),
    );
    startRef.current = {
      cx,
      cy,
      startDeg,
      pointerDeg: pointerAngleDeg(e.clientX, e.clientY, cx, cy),
    };
    latestRef.current = startDeg;
    setLive({ deg: startDeg, snapped: false });
    setCursor({ x: e.clientX, y: e.clientY });
    setDragging(true);
  }

  function reset(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onCommitRotate(0);
  }

  const zone = (extra: React.CSSProperties): React.CSSProperties => ({
    position: "absolute",
    width: ZONE_SIZE,
    height: ZONE_SIZE,
    // Invisible grab area — the rotate affordance is the cursor itself,
    // matching Figma. Kept transparent so the corner stays visually quiet.
    background: "transparent",
    border: "none",
    padding: 0,
    cursor: ROTATE_CURSOR,
    pointerEvents: "auto",
    touchAction: "none",
    ...extra,
  });

  return (
    <>
      <div
        ref={overlayRef}
        aria-hidden
        data-canvas-rotate-overlay=""
        style={{
          position: "fixed",
          // When overlayRef is wired the parent's rAF loop OWNS
          // top/left/width/height + transform (written each frame, seeded
          // pre-paint); otherwise fall back to the rect prop.
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
        {(
          [
            ["nw", { top: ZONE_OFFSET, left: ZONE_OFFSET }],
            ["ne", { top: ZONE_OFFSET, right: ZONE_OFFSET }],
            ["se", { bottom: ZONE_OFFSET, right: ZONE_OFFSET }],
            ["sw", { bottom: ZONE_OFFSET, left: ZONE_OFFSET }],
          ] as const
        ).map(([corner, pos]) => (
          <button
            key={corner}
            type="button"
            aria-label={t("Drag to rotate (double-click to reset)")}
            title={t("Drag to rotate · double-click to reset")}
            data-canvas-rotate-handle={corner}
            onPointerDown={begin}
            onDoubleClick={reset}
            style={zone(pos)}
          />
        ))}
      </div>
      {/* Live angle readout riding the cursor (same visual language as the
       *  W×H readout on the resize handles). Rendered outside the rotated
       *  overlay so the text never tilts. */}
      {dragging ? (
        <span
          data-canvas-rotate-readout=""
          style={{
            position: "fixed",
            top: cursor.y + 18,
            left: cursor.x + 18,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
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
            zIndex: 99,
            fontFamily:
              'ui-sans-serif, "SF Pro Text", system-ui, -apple-system, sans-serif',
          }}
        >
          <span>
            {`${live.deg}°`}
            {live.snapped ? "  ⌖" : ""}
          </span>
          <span style={{ fontWeight: 600, opacity: 0.78, fontSize: 9 }}>
            {t("⌘ free · ⇧ 15°")}
          </span>
        </span>
      ) : null}
    </>
  );
}
