/**
 * canvas-transform-geometry — pure math for the canvas ROTATION handle and the
 * rotation-aware selection overlay (no DOM, no React), following the codebase
 * precedent of `canvas-align-guides.ts` / `multi-node-layout.ts`: geometry in a
 * tested pure module, the component keeps only the event wiring.
 *
 * Covers:
 *   • CSS angle parsing — `getComputedStyle(el).rotate` returns "none" or an
 *     angle in any CSS unit (deg / rad / grad / turn).
 *   • Angle normalization to the (-180, 180] band, so a full-circle drag never
 *     accumulates 720°-style values into the persisted escape.
 *   • The rotation MAGNET — snap to the 8 compass angles (0/45/90/…/315, i.e.
 *     every multiple of 45° in normalized space) within a ±5° tolerance.
 *     Modifier convention (one convention across the whole handle set, see
 *     canvas-resize-handles.tsx): ⌘ disables snapping entirely ("free"),
 *     ⇧ quantizes to fine 15° steps instead of the magnet.
 *   • CSS scale-pair parsing + the unrotated ("visual") box recovery used to
 *     draw the selection ring rotated WITH the element instead of drawing an
 *     axis-aligned box around a tilted element: `getBoundingClientRect()` on a
 *     rotated element returns the AABB of the rotated quad, but the quad's
 *     centre equals the AABB centre, and the unrotated size is the element's
 *     layout size (offsetWidth/Height) times the canvas zoom and any CSS
 *     `scale` escape.
 *   • Local-axis pointer mapping for resizing a rotated element — a screen-
 *     space pointer delta projected onto the element's own (rotated) axes.
 */

/** Magnet targets are every multiple of this step (the 8 compass angles). */
export const ROTATION_MAGNET_STEP = 45;
/** Degrees within which the magnet captures the raw angle. */
export const ROTATION_MAGNET_TOLERANCE = 5;
/** ⇧ quantization step (fine rotate). */
export const ROTATION_FINE_STEP = 15;

/** Normalize any angle in degrees into the (-180, 180] band. */
export function normalizeAngleDeg(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  let a = deg % 360;
  if (a <= -180) a += 360;
  if (a > 180) a -= 360;
  // -0 → 0 so string formatting never prints "-0deg".
  return a === 0 ? 0 : a;
}

/**
 * Parse a CSS rotate value ("none", "30deg", "0.5turn", "1.2rad", "40grad")
 * into degrees. Unknown / empty input parses to 0 — an unrotated element.
 */
export function parseRotateDeg(value: string | null | undefined): number {
  if (!value || value === "none") return 0;
  const m = /(-?\d*\.?\d+)(deg|rad|grad|turn)?/.exec(value.trim());
  if (!m) return 0;
  const n = parseFloat(m[1] ?? "0");
  if (!Number.isFinite(n)) return 0;
  switch (m[2]) {
    case "rad":
      return (n * 180) / Math.PI;
    case "grad":
      return n * 0.9;
    case "turn":
      return n * 360;
    default:
      return n;
  }
}

export interface RotationSnapInput {
  /** Requested angle in degrees (any range — normalized internally). */
  raw: number;
  /** ⌘ held — disable ALL snapping (free rotate). Wins over `fineStep`. */
  disableSnap?: boolean;
  /** ⇧ held — quantize to ROTATION_FINE_STEP (15°) increments. */
  fineStep?: boolean;
}

export interface RotationSnapResult {
  /** The resolved angle, normalized to (-180, 180], 0.1° precision. */
  deg: number;
  /** True when the magnet (or the ⇧ step) altered the raw angle. */
  snapped: boolean;
}

/**
 * The rotation magnet. Default: capture to the nearest multiple of 45° when
 * within ±ROTATION_MAGNET_TOLERANCE, otherwise pass the raw angle through.
 * ⇧ = quantize to 15° steps (fine). ⌘ = fully free (no snapping; wins).
 */
export function snapRotationDeg(input: RotationSnapInput): RotationSnapResult {
  const raw = normalizeAngleDeg(input.raw);
  if (input.disableSnap) {
    return { deg: roundTenth(raw), snapped: false };
  }
  if (input.fineStep) {
    const stepped = normalizeAngleDeg(
      Math.round(raw / ROTATION_FINE_STEP) * ROTATION_FINE_STEP,
    );
    return { deg: roundTenth(stepped), snapped: stepped !== raw };
  }
  const nearest = Math.round(raw / ROTATION_MAGNET_STEP) * ROTATION_MAGNET_STEP;
  if (Math.abs(raw - nearest) <= ROTATION_MAGNET_TOLERANCE) {
    return { deg: normalizeAngleDeg(nearest), snapped: true };
  }
  return { deg: roundTenth(raw), snapped: false };
}

function roundTenth(deg: number): number {
  const r = Math.round(deg * 10) / 10;
  return r === 0 ? 0 : r;
}

/**
 * Parse a CSS `scale` computed value ("none", "1.05", "1.05 1.2") into an
 * {x, y} pair. A single factor applies to both axes (CSS semantics).
 */
export function parseScalePair(value: string | null | undefined): {
  x: number;
  y: number;
} {
  if (!value || value === "none") return { x: 1, y: 1 };
  const parts = value.trim().split(/\s+/);
  const x = parseFloat(parts[0] ?? "1");
  const y = parseFloat(parts[1] ?? parts[0] ?? "1");
  return {
    x: Number.isFinite(x) && x !== 0 ? x : 1,
    y: Number.isFinite(y) && y !== 0 ? y : 1,
  };
}

export interface RotatedVisualBoxInput {
  /** getBoundingClientRect() of the (possibly rotated) element — its AABB. */
  rectLeft: number;
  rectTop: number;
  rectWidth: number;
  rectHeight: number;
  /** Layout size (offsetWidth/offsetHeight) — unaffected by transforms. */
  offsetWidth: number;
  offsetHeight: number;
  /** Canvas zoom (CanvasViewportProvider) — scales layout px → visual px. */
  zoom: number;
  /** The element's own CSS `scale` escape (parseScalePair). */
  scaleX: number;
  scaleY: number;
}

/**
 * Recover the UNROTATED visual box of a rotated element so a fixed-position
 * overlay of that size, placed at this top/left and given
 * `transform: rotate(θ)` (default centre origin), sits exactly on the element.
 *
 * Works because a rotated rectangle's AABB shares its centre with the
 * rectangle for ANY transform-origin — rotation about an off-centre origin
 * only translates the quad, and the AABB centre translates with it.
 */
export function rotatedVisualBox(input: RotatedVisualBoxInput): {
  top: number;
  left: number;
  width: number;
  height: number;
} {
  const width = input.offsetWidth * input.zoom * input.scaleX;
  const height = input.offsetHeight * input.zoom * input.scaleY;
  const cx = input.rectLeft + input.rectWidth / 2;
  const cy = input.rectTop + input.rectHeight / 2;
  return {
    top: cy - height / 2,
    left: cx - width / 2,
    width,
    height,
  };
}

/**
 * Rotate a screen-space vector INTO an element's local (rotated) axes: the
 * inverse rotation. Used by the resize handles so dragging the E handle of a
 * 30°-tilted element grows its width along its own edge, not along screen X.
 */
export function toLocalAxesDeg(
  dx: number,
  dy: number,
  rotationDeg: number,
): { x: number; y: number } {
  const rad = (-rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
}

/**
 * Pointer angle (degrees) of a point around a pivot, measured like the CSS
 * rotation it drives (0° pointing up would be arbitrary — we only ever use
 * DIFFERENCES of this value, so the absolute reference does not matter).
 */
export function pointerAngleDeg(
  px: number,
  py: number,
  cx: number,
  cy: number,
): number {
  return (Math.atan2(py - cy, px - cx) * 180) / Math.PI;
}
