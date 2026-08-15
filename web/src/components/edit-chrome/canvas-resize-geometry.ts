/**
 * canvas-resize-geometry — pure math for the 8-handle canvas resize gesture
 * (no DOM, no React; codebase precedent: canvas-align-guides.ts,
 * canvas-transform-geometry.ts). The component keeps only the event wiring and
 * the measurement-based position compensation (which needs the live DOM).
 *
 * MODIFIER CONVENTION (one convention across the whole handle set — decided
 * with the rotation handle, matching Figma):
 *   ⌘ = disable snapping ("free")
 *   ⇧ = aspect-ratio lock (corner handles) / fine 15° steps (rotate)
 *   ⌥ = resize from the centre (both edges move symmetrically)
 */

/** Minimum committed dimension (px) — matches the pre-existing handle floor. */
export const RESIZE_MIN_SIZE = 24;
/** Grid step when no target snap wins (Webflow-style). */
export const RESIZE_GRID = 8;
/** px within which a dragged length snaps to a parent-derived target. */
export const RESIZE_SNAP_THRESHOLD = 14;
/** px within which the dragged EDGE snaps to a sibling / parent edge. */
export const RESIZE_EDGE_SNAP = 8;

export type ResizeHandleId =
  | "n"
  | "s"
  | "e"
  | "w"
  | "ne"
  | "nw"
  | "se"
  | "sw";

export interface ResizeHandleAxes {
  /** Which horizontal edge moves: -1 = west, 0 = none, 1 = east. */
  x: -1 | 0 | 1;
  /** Which vertical edge moves: -1 = north, 0 = none, 1 = south. */
  y: -1 | 0 | 1;
}

export function resizeHandleAxes(handle: ResizeHandleId): ResizeHandleAxes {
  switch (handle) {
    case "n":
      return { x: 0, y: -1 };
    case "s":
      return { x: 0, y: 1 };
    case "e":
      return { x: 1, y: 0 };
    case "w":
      return { x: -1, y: 0 };
    case "ne":
      return { x: 1, y: -1 };
    case "nw":
      return { x: -1, y: -1 };
    case "se":
      return { x: 1, y: 1 };
    case "sw":
      return { x: -1, y: 1 };
  }
}

export function isCornerHandle(handle: ResizeHandleId): boolean {
  return handle.length === 2;
}

export interface ResizeDimsInput {
  handle: ResizeHandleId;
  /** Element size at grab time (layout px). */
  startW: number;
  startH: number;
  /**
   * Pointer travel since grab, in the element's LOCAL layout axes (screen
   * delta ÷ zoom, projected through the element's rotation — see
   * toLocalAxesDeg). +x = toward the element's own east edge.
   */
  dxLocal: number;
  dyLocal: number;
  /** ⇧ on a corner — preserve startW:startH. Ignored on edge handles. */
  aspectLock: boolean;
  /** ⌥ — both opposite edges move; each dimension changes at 2× rate. */
  fromCenter: boolean;
  minSize?: number;
}

export interface ResizeDims {
  w: number;
  h: number;
  /** Which axes this gesture actually resizes (for commit + preview). */
  affectsX: boolean;
  affectsY: boolean;
}

/**
 * Raw (pre-snap) dimensions for a resize drag. A west/north handle inverts the
 * pointer delta so dragging outward always grows; ⌥ doubles the rate (both
 * edges move); ⇧ on a corner locks the aspect ratio to the grab-time ratio,
 * driven by the axis with the larger relative change; the floor clamp
 * preserves a locked ratio by scaling both dimensions up together.
 */
export function computeResizeDims(input: ResizeDimsInput): ResizeDims {
  const axes = resizeHandleAxes(input.handle);
  const min = input.minSize ?? RESIZE_MIN_SIZE;
  const rate = input.fromCenter ? 2 : 1;
  const affectsX = axes.x !== 0;
  const affectsY = axes.y !== 0;
  const w = affectsX
    ? input.startW + input.dxLocal * axes.x * rate
    : input.startW;
  const h = affectsY
    ? input.startH + input.dyLocal * axes.y * rate
    : input.startH;

  if (input.aspectLock && isCornerHandle(input.handle) && input.startH > 0 && input.startW > 0) {
    // Ratio lock as a single scale factor from the dominant axis (larger
    // relative change), clamped so the SMALLER dimension never dips below the
    // floor — which also absorbs a drag pulled past zero (negative raw size).
    const relW = Math.abs(w - input.startW) / input.startW;
    const relH = Math.abs(h - input.startH) / input.startH;
    const dominant = relW >= relH ? w / input.startW : h / input.startH;
    const s = Math.max(dominant, min / input.startW, min / input.startH);
    return {
      w: Math.round(input.startW * s),
      h: Math.round(input.startH * s),
      affectsX,
      affectsY,
    };
  }

  return {
    w: Math.max(min, Math.round(w)),
    h: Math.max(min, Math.round(h)),
    affectsX,
    affectsY,
  };
}

/**
 * Snap a raw dragged length to (a) any of the supplied parent-derived targets
 * (full width, halves, thirds) when close, else (b) the nearest grid step.
 * `free` (⌘) bypasses all snapping. Returns a short label when a parent
 * target won — surfaced as a "Full" / "½" hint in the readout.
 * (Moved verbatim from canvas-resize-handles.tsx so it is unit-testable.)
 */
export function snapResizeLength(
  raw: number,
  free: boolean,
  targets: ReadonlyArray<{ value: number; label: string }>,
): { value: number; label: string | null } {
  if (free) return { value: Math.round(raw), label: null };
  for (const t of targets) {
    if (Math.abs(raw - t.value) <= RESIZE_SNAP_THRESHOLD) {
      return { value: Math.round(t.value), label: t.label };
    }
  }
  return { value: Math.round(raw / RESIZE_GRID) * RESIZE_GRID, label: null };
}

/**
 * The anchor that must stay visually fixed for a handle: the opposite
 * edge/corner, or the centre under ⌥. Returned as fractional coordinates of
 * the element's box (0 = left/top edge, 0.5 = centre, 1 = right/bottom edge).
 * The component samples this point's viewport position at grab time and
 * translates the element after each preview write so it never drifts —
 * left/top-edge resizes keep the right/bottom edge planted.
 */
export function resizeAnchorFraction(
  handle: ResizeHandleId,
  fromCenter: boolean,
): { fx: number; fy: number } {
  if (fromCenter) return { fx: 0.5, fy: 0.5 };
  const axes = resizeHandleAxes(handle);
  return {
    fx: axes.x === 1 ? 0 : axes.x === -1 ? 1 : 0.5,
    fy: axes.y === 1 ? 0 : axes.y === -1 ? 1 : 0.5,
  };
}
