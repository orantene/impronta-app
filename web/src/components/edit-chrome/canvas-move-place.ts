/**
 * canvas-move-place — drag-to-place for out-of-flow (absolute / fixed) children.
 *
 * In-flow blocks still move by `style.translate` (canvas-move-handle.tsx). When
 * `style.position` is `absolute` or `fixed`, the same grip writes inset
 * `top` / `left` (and shifts an already-authored `right` / `bottom` so the box
 * does not stretch). Tablet/mobile canvases land in `responsive.{tier}` through
 * the inspector's `styleWithViewportPatch` so a phone drag cannot rewrite
 * desktop insets.
 *
 * Snap maths (8px grid, sibling/parent edges, operator guides, equal spacing)
 * live here so the handle and the tests drive one function. Guides go through
 * `snapToGuideLines` (GUIDE_SNAP_PX / ALIGN tolerance).
 */

import type {
  BuilderNodeStyle,
  BuilderNodeStyleValue,
} from "@/lib/site-admin/builder-node";

import {
  equalSpacingSnapDelta,
  findEqualSpacing,
  type GuideBox,
  type SpacingGuide,
} from "./canvas-align-guides";
import {
  snapToGuideLines,
  type GuideViewportLines,
} from "./canvas-guide-snap";
import { styleWithViewportPatch } from "./inspectors/style-panel/viewport-style-patch";
import {
  readCanvasStyleValue,
  type ResponsiveStyleBucket,
} from "./responsive-canvas-style";

export const MOVE_GRID_PX = 8;
export const MOVE_ALIGN_PX = 6;
export const MOVE_SPACING_SNAP_PX = 6;
/** Keep this many px of the block inside its parent on every edge. */
export const MOVE_KEEP_INSIDE_PX = 40;

export type MovePlacement = "translate" | "absolute";

export interface AbsolutePlaceCommit {
  left: number;
  top: number;
  startLeft: number;
  startTop: number;
}

export interface MoveDragOrigin {
  x: number;
  y: number;
  natCx: number;
  natCy: number;
  natLeft: number;
  natTop: number;
  width: number;
  height: number;
  halfW: number;
  halfH: number;
  snapX: ReadonlyArray<number>;
  snapY: ReadonlyArray<number>;
  sibBoxes: ReadonlyArray<GuideBox>;
  guideLines: GuideViewportLines;
}

export interface MoveDragStepResult {
  x: number;
  y: number;
  alignV: number | null;
  alignH: number | null;
  userV: number | null;
  userH: number | null;
  spacing: ReadonlyArray<SpacingGuide>;
}

function pruneStyle<T extends object>(value: T | undefined): T | undefined {
  if (!value) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined || entry === null || entry === "") continue;
    out[key] = entry;
  }
  return Object.keys(out).length > 0 ? (out as T) : undefined;
}

const PLACE_CLEANERS = {
  cleanStyle: (value: BuilderNodeStyle | undefined) => pruneStyle(value),
  cleanValue: (value: BuilderNodeStyleValue | undefined) => pruneStyle(value),
};

export function isOutOfFlowPosition(value: unknown): boolean {
  return value === "absolute" || value === "fixed";
}

export function resolveMovePlacement(
  style: Record<string, unknown> | undefined,
  bucket: ResponsiveStyleBucket,
): MovePlacement {
  return isOutOfFlowPosition(readCanvasStyleValue(style, bucket, "position"))
    ? "absolute"
    : "translate";
}

export function viewportFromCanvasBucket(
  bucket: ResponsiveStyleBucket,
): "desktop" | "tablet" | "mobile" {
  if (bucket === "tablet") return "tablet";
  if (bucket === "mobile") return "mobile";
  return "desktop";
}

export function parseInsetPx(value: string | null | undefined): number | null {
  if (!value || value === "auto" || value === "none") return null;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

export function formatInsetPx(px: number): string {
  return `${Math.round(px)}px`;
}

/**
 * Thin wrapper so the move grip (and its test) snap through `snapToGuideLines`
 * rather than a private copy of the tolerance.
 */
export function snapMoveToGuideLines(
  pos: number,
  lines: Parameters<typeof snapToGuideLines>[1],
  axis: "x" | "y",
  tolerance: number = MOVE_ALIGN_PX,
): { pos: number; guide: number | null } {
  return snapToGuideLines(pos, lines, axis, tolerance);
}

export function readPaintedMoveOrigin(
  el: HTMLElement,
  placement: MovePlacement,
): { x: number; y: number } {
  const cs = getComputedStyle(el);
  if (placement !== "absolute") {
    const raw = cs.translate;
    if (!raw || raw === "none") return { x: 0, y: 0 };
    const parts = raw.trim().split(/\s+/);
    const x = Number.parseFloat(parts[0] ?? "0") || 0;
    const y = Number.parseFloat(parts[1] ?? "0") || 0;
    return { x, y };
  }
  const left = parseInsetPx(cs.left);
  const top = parseInsetPx(cs.top);
  if (left !== null && top !== null) return { x: left, y: top };
  const er = el.getBoundingClientRect();
  const pr = el.parentElement?.getBoundingClientRect();
  return {
    x: left ?? (pr ? er.left - pr.left : 0),
    y: top ?? (pr ? er.top - pr.top : 0),
  };
}

export function applyMovePreview(
  el: HTMLElement,
  placement: MovePlacement,
  x: number,
  y: number,
): void {
  if (placement === "absolute") {
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    return;
  }
  el.style.translate = `${x}px ${y}px`;
}

/**
 * Keep ≥ MOVE_KEEP_INSIDE_PX of the block inside its parent. `x`/`y` are the
 * values the drag is about to commit (translate offsets, or inset left/top).
 * The live rect already reflects the preview, so the untranslated / zero-inset
 * origin is current visual minus that offset.
 */
export function clampCanvasMoveInsideParent(
  el: HTMLElement | null,
  x: number,
  y: number,
): { x: number; y: number } {
  const parent = el?.parentElement ?? null;
  if (!el || !parent) return { x, y };
  const er = el.getBoundingClientRect();
  const pr = parent.getBoundingClientRect();
  const naturalLeft = er.left - x;
  const naturalTop = er.top - y;
  const minX = pr.left + MOVE_KEEP_INSIDE_PX - er.width - naturalLeft;
  const maxX = pr.right - MOVE_KEEP_INSIDE_PX - naturalLeft;
  const minY = pr.top + MOVE_KEEP_INSIDE_PX - er.height - naturalTop;
  const maxY = pr.bottom - MOVE_KEEP_INSIDE_PX - naturalTop;
  let cx = x;
  let cy = y;
  if (minX <= maxX) cx = Math.max(minX, Math.min(maxX, x));
  if (minY <= maxY) cy = Math.max(minY, Math.min(maxY, y));
  return { x: cx, y: cy };
}

function gridSnap(value: number, free: boolean): number {
  return free ? Math.round(value) : Math.round(value / MOVE_GRID_PX) * MOVE_GRID_PX;
}

/**
 * One pointer-move frame: grid snap, then sibling/parent edge align, then
 * operator-placed guides (`snapToGuideLines`), then equal-spacing. ⌘ skips
 * every snap except rounding to a whole pixel.
 */
export function resolveMoveDragStep(input: {
  origin: MoveDragOrigin;
  rawX: number;
  rawY: number;
  free: boolean;
}): MoveDragStepResult {
  const { origin, free } = input;
  let x = gridSnap(input.rawX, free);
  let y = gridSnap(input.rawY, free);
  let alignV: number | null = null;
  let alignH: number | null = null;
  let userV: number | null = null;
  let userH: number | null = null;

  if (!free) {
    const xAnchors = [
      origin.natCx - origin.halfW,
      origin.natCx,
      origin.natCx + origin.halfW,
    ];
    const yAnchors = [
      origin.natCy - origin.halfH,
      origin.natCy,
      origin.natCy + origin.halfH,
    ];
    let bestX: { guide: number; tx: number; d: number } | null = null;
    for (const coord of origin.snapX) {
      for (const anchor of xAnchors) {
        const tx = coord - anchor;
        const d = Math.abs(tx - x);
        if (d <= MOVE_ALIGN_PX && (!bestX || d < bestX.d)) {
          bestX = { guide: coord, tx, d };
        }
      }
    }
    if (bestX) {
      x = Math.round(bestX.tx);
      alignV = bestX.guide;
    }
    let bestY: { guide: number; ty: number; d: number } | null = null;
    for (const coord of origin.snapY) {
      for (const anchor of yAnchors) {
        const ty = coord - anchor;
        const d = Math.abs(ty - y);
        if (d <= MOVE_ALIGN_PX && (!bestY || d < bestY.d)) {
          bestY = { guide: coord, ty, d };
        }
      }
    }
    if (bestY) {
      y = Math.round(bestY.ty);
      alignH = bestY.guide;
    }
    if (alignV === null && origin.guideLines.v.length > 0) {
      let best: { tx: number; line: number; d: number } | null = null;
      for (const anchor of xAnchors) {
        const p = anchor + x;
        const s = snapMoveToGuideLines(p, origin.guideLines.v, "y", MOVE_ALIGN_PX);
        if (s.guide === null) continue;
        const d = Math.abs(s.pos - p);
        if (!best || d < best.d) best = { tx: x + (s.pos - p), line: s.guide, d };
      }
      if (best) {
        x = Math.round(best.tx);
        userV = best.line;
      }
    }
    if (alignH === null && origin.guideLines.h.length > 0) {
      let best: { ty: number; line: number; d: number } | null = null;
      for (const anchor of yAnchors) {
        const p = anchor + y;
        const s = snapMoveToGuideLines(p, origin.guideLines.h, "x", MOVE_ALIGN_PX);
        if (s.guide === null) continue;
        const d = Math.abs(s.pos - p);
        if (!best || d < best.d) best = { ty: y + (s.pos - p), line: s.guide, d };
      }
      if (best) {
        y = Math.round(best.ty);
        userH = best.line;
      }
    }
  }

  const spacing: SpacingGuide[] = [];
  if (!free && origin.sibBoxes.length > 0) {
    const boxAt = (tx: number, ty: number): GuideBox => ({
      left: origin.natLeft + tx,
      top: origin.natTop + ty,
      width: origin.width,
      height: origin.height,
    });
    if (alignV === null && userV === null) {
      const delta = equalSpacingSnapDelta({
        dragged: boxAt(x, y),
        siblings: origin.sibBoxes,
        axis: "x",
        tol: MOVE_SPACING_SNAP_PX,
      });
      if (delta !== null) x = Math.round(x + delta);
    }
    if (alignH === null && userH === null) {
      const delta = equalSpacingSnapDelta({
        dragged: boxAt(x, y),
        siblings: origin.sibBoxes,
        axis: "y",
        tol: MOVE_SPACING_SNAP_PX,
      });
      if (delta !== null) y = Math.round(y + delta);
    }
    const finalBox = boxAt(x, y);
    for (const axis of ["x", "y"] as const) {
      const match = findEqualSpacing({
        dragged: finalBox,
        siblings: origin.sibBoxes,
        axis,
        tol: 1,
      });
      if (match) spacing.push(match);
    }
  }

  return { x, y, alignV, alignH, userV, userH, spacing };
}

function effectiveStyleBag(
  style: BuilderNodeStyle | undefined,
  viewport: "desktop" | "tablet" | "mobile",
): Record<string, unknown> {
  const base = { ...((style ?? {}) as Record<string, unknown>) };
  if (viewport === "desktop") return base;
  const tier = (
    style?.responsive as Record<string, Record<string, unknown>> | undefined
  )?.[viewport];
  return { ...base, ...(tier ?? {}) };
}

function readAuthoredPx(
  bag: Record<string, unknown>,
  key: string,
): number | null {
  const value = bag[key];
  return typeof value === "string" ? parseInsetPx(value) : null;
}

/**
 * Next stored style after an absolute/fixed drag-to-place. Always writes
 * `top` / `left` as px. An already-authored `right` / `bottom` on the effective
 * style shifts by the same delta so width/height stay put. Routes through
 * `styleWithViewportPatch` so a mobile write cannot touch desktop insets.
 */
export function styleWithAbsolutePlacePatch(input: {
  currentStyle: BuilderNodeStyle | undefined;
  viewport: "desktop" | "tablet" | "mobile";
  left: number;
  top: number;
  startLeft: number;
  startTop: number;
}): BuilderNodeStyle | undefined {
  const dx = input.left - input.startLeft;
  const dy = input.top - input.startTop;
  const effective = effectiveStyleBag(input.currentStyle, input.viewport);
  const patch: Partial<BuilderNodeStyleValue> = {
    left: formatInsetPx(input.left),
    top: formatInsetPx(input.top),
  };
  const authoredRight = readAuthoredPx(effective, "right");
  if (authoredRight !== null) {
    patch.right = formatInsetPx(authoredRight - dx);
  }
  const authoredBottom = readAuthoredPx(effective, "bottom");
  if (authoredBottom !== null) {
    patch.bottom = formatInsetPx(authoredBottom - dy);
  }
  return styleWithViewportPatch(
    input.currentStyle,
    input.viewport,
    "viewport",
    patch,
    PLACE_CLEANERS,
  );
}
