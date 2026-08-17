"use client";

/**
 * selection-overlay-boxes.ts — how the selection chrome's boxes are measured
 * and written, extracted from `selection-layer.tsx`'s two rAF tracking loops.
 *
 * ── The bug this exists to fix ────────────────────────────────────────────
 * Owner, verbatim: "the border of selected section gets stuck when another
 * user is there in mobile and the other in desktop."
 *
 * Both loops wrote `style.top/left/width/height` straight onto the ring and
 * the handle boxes, and both had the same two holes:
 *
 *   const el = getSelectedBuilderNodeEl() ?? getSelectedSectionEl();
 *   if (!el) return;                    // ← leaves the LAST box on screen
 *   const r = el.getBoundingClientRect(); // ← 0×0 for a detached / display:none
 *                                          //   node, written verbatim
 *
 * So the moment the selected node stopped being measurable — it unmounted, a
 * device-preview tier swapped the canvas out from under it, a peer's node was
 * deleted — the overlay simply kept its last coordinates. Nothing ever cleared
 * it, because the clear only lived on the React path
 * (`scheduleRectRecompute`), which needs a scroll/resize/observer signal to
 * run and gets none when a node quietly disappears.
 *
 * The fix is `applyOverlayBox(el, null)`: an unmeasurable target HIDES its
 * overlay instead of freezing it. `visibility` rather than `display` so the
 * box keeps its place in the portal and costs no reflow, and because
 * `visibility: hidden` also makes the handles non-interactive — a stuck ring
 * you can still drag is worse than a stuck ring.
 *
 * Everything here is pure DOM plumbing with no React, so the rules are
 * unit-testable against a fake element.
 */

import {
  normalizeAngleDeg,
  parseRotateDeg,
  parseScalePair,
  rotatedVisualBox,
} from "./canvas-transform-geometry";

export interface OverlayBox {
  top: number;
  left: number;
  width: number;
  height: number;
  /** "" when the element is not rotated. */
  transform: string;
}

/** The subset of a DOMRect these loops read. */
export interface MeasuredRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Is this rect worth drawing chrome around?
 *
 * A detached node, a `display: none` node, and a node inside a hidden
 * device-preview tier all return an all-zero rect. Drawing a 0×0 ring at the
 * viewport origin is never right, and — worse — SKIPPING the write (what the
 * old loops did) leaves the previous, plausible-looking box on screen. Note
 * `visibility: hidden` does NOT produce a zero rect; that case is handled by
 * the callers' own device gating, not here.
 */
export function isMeasurableRect(rect: MeasuredRect): boolean {
  return rect.width > 0 || rect.height > 0;
}

/**
 * The box the chrome should occupy for `el`, or null when `el` is missing or
 * not measurable — in which case the caller must HIDE its overlays.
 *
 * `zoom` only matters for the rotated branch: a rotated element's bounding
 * rect is the AABB of the tilted quad, so the unrotated box has to be
 * recovered from layout size × zoom × scale.
 */
export function resolveOverlayBox(
  el: HTMLElement | null | undefined,
  zoom: number,
  readComputedStyle: (node: HTMLElement) => {
    rotate: string;
    scale: string;
  } = (node) => getComputedStyle(node),
): OverlayBox | null {
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (!isMeasurableRect(rect)) return null;

  const computed = readComputedStyle(el);
  const rotationDeg = normalizeAngleDeg(parseRotateDeg(computed.rotate));
  if (rotationDeg === 0) {
    return {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      transform: "",
    };
  }
  const scale = parseScalePair(computed.scale);
  const box = rotatedVisualBox({
    rectLeft: rect.left,
    rectTop: rect.top,
    rectWidth: rect.width,
    rectHeight: rect.height,
    offsetWidth: el.offsetWidth,
    offsetHeight: el.offsetHeight,
    zoom,
    scaleX: scale.x,
    scaleY: scale.y,
  });
  return { ...box, transform: `rotate(${rotationDeg}deg)` };
}

/**
 * Write a box onto one overlay element, or hide it when `box` is null.
 *
 * THE STUCK-BORDER FIX lives in the null branch. Passing null must never be a
 * no-op: an overlay whose target vanished has to stop being drawn, or the
 * operator is left staring at a selection ring around nothing.
 */
export function applyOverlayBox(
  el: HTMLElement | null | undefined,
  box: OverlayBox | null,
): void {
  if (!el) return;
  if (!box) {
    el.style.visibility = "hidden";
    return;
  }
  el.style.visibility = "";
  el.style.top = `${box.top}px`;
  el.style.left = `${box.left}px`;
  el.style.width = `${box.width}px`;
  el.style.height = `${box.height}px`;
  el.style.transform = box.transform;
}

/** Apply one box (or one hide) across a set of overlay refs. */
export function applyOverlayBoxes(
  els: ReadonlyArray<HTMLElement | null | undefined>,
  box: OverlayBox | null,
): void {
  for (const el of els) applyOverlayBox(el, box);
}
