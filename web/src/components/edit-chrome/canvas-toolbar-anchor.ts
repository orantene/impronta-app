/**
 * canvas-toolbar-anchor — placement math + thin DOM writer that anchors the
 * contextual selection toolbar(s) to the SELECTION's viewport bounding box,
 * instead of docking them to the bottom of the viewport (the pre-2026-08
 * behaviour that put a top-of-page section's actions ~1500px away from it).
 *
 * Follows the codebase precedent of `selection-layer-geometry.ts` /
 * `canvas-transform-geometry.ts`: every placement decision is a pure function
 * over plain numbers (unit-tested, no DOM), and the DOM half is limited to
 * measuring (`measureAnchorOccluders`) and writing styles
 * (`positionAnchoredToolbarStack`) so `selection-layer.tsx` keeps only the
 * call sites inside its existing rAF geometry loop.
 *
 * PLACEMENT RULES (resolveAnchoredToolbarStack)
 * ─────────────────────────────────────────────
 *   1. ABOVE the box (Figma/Framer convention), separated by ANCHOR_GAP.
 *   2. FLIP BELOW when there is not enough room above (box near the top of
 *      the viewport / under the edit topbar).
 *   3. INSIDE — when the box is taller than the remaining viewport (a hero
 *      section on a short window), pin the stack just inside the box's
 *      VISIBLE top edge: the edge with room wins, and the toolbar never
 *      detaches from what it acts on.
 *   Whatever the branch, the whole stack is finally clamped into the
 *   viewport's vertical safe band so a selection scrolled off-screen still
 *   leaves its actions reachable at the nearest edge.
 *
 * The stack supports MULTIPLE bars (`bars[0]` sits nearest the box): a single
 * selected container renders the selection chip plus the ungroup/multi bar,
 * and both must anchor as one unit instead of overlapping.
 *
 * HORIZONTAL — each bar is centred on the box and clamped so it never leaves
 * the viewport, then pushed clear of any chrome occluder whose rect overlaps
 * the bar's vertical band: the left command dock + left floating panels, the
 * right inspector rail / inspector dock / drawers, the bottom-left zoom bar
 * and the nested-blocks panel. Occluders anchored in the left half of the
 * viewport raise the lower bound; right-half occluders lower the upper bound.
 * When chrome on both sides squeezes the bar out entirely, the viewport-only
 * clamp wins — a bar overlapping a panel is still better than one off-screen.
 *
 * ROTATION (#1119): callers anchor off the element's live AABB
 * (getBoundingClientRect of the rotated quad), which IS its visual bounds —
 * NOT the recovered unrotated box the ring/handles use. The bars themselves
 * never receive the rotation transform, so the toolbar stays upright while
 * tracking a tilted element.
 */

import { EDIT_TOPBAR_H } from "./kit/tokens";

export interface AnchorBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface AnchorBarSize {
  width: number;
  height: number;
}

/** Viewport-space rect of a chrome surface the toolbar must not sit under. */
export interface AnchorOccluder {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type AnchorPlacement = "above" | "below" | "inside";

/** Breathing room between the selection box and the nearest bar. */
export const ANCHOR_GAP = 10;
/** Vertical gap between stacked bars. */
export const ANCHOR_STACK_GAP = 8;
/** Minimum distance every bar keeps from the viewport edges. */
export const ANCHOR_VIEWPORT_MARGIN = 8;
/** Bars never rise into the edit topbar. */
export const ANCHOR_TOP_INSET = EDIT_TOPBAR_H + ANCHOR_VIEWPORT_MARGIN;
/** Breathing room between a bar and a chrome occluder it clears. */
export const ANCHOR_OCCLUDER_GAP = 8;

export interface AnchoredToolbarStackInput {
  box: AnchorBox;
  /** Bar sizes; `bars[0]` renders nearest the box. */
  bars: readonly AnchorBarSize[];
  viewport: { width: number; height: number };
  occluders?: readonly AnchorOccluder[];
  gap?: number;
  stackGap?: number;
  topInset?: number;
  margin?: number;
}

export interface AnchoredBarPosition {
  top: number;
  left: number;
}

export interface AnchoredToolbarStack {
  placement: AnchorPlacement;
  /** Same order as the input `bars`. */
  bars: AnchoredBarPosition[];
}

function clampNumber(value: number, lo: number, hi: number): number {
  return Math.min(Math.max(value, lo), hi);
}

export interface ClampAnchoredBarLeftInput {
  /** The centred-on-the-box left the bar would take with no constraints. */
  idealLeft: number;
  width: number;
  /** The vertical band the bar occupies — occluders outside it don't count. */
  band: { top: number; bottom: number };
  viewportWidth: number;
  occluders: readonly AnchorOccluder[];
  margin?: number;
  occluderGap?: number;
}

/**
 * Horizontal clamp for one bar. Occluders that overlap the bar's vertical
 * band tighten the allowed range from whichever viewport half they anchor
 * in; a squeeze that empties the range falls back to the viewport-only clamp
 * (documented above — visible beats off-screen).
 */
export function clampAnchoredBarLeft(input: ClampAnchoredBarLeftInput): number {
  const margin = input.margin ?? ANCHOR_VIEWPORT_MARGIN;
  const occluderGap = input.occluderGap ?? ANCHOR_OCCLUDER_GAP;
  const viewportLo = margin;
  const viewportHi = Math.max(margin, input.viewportWidth - margin - input.width);
  let lo = viewportLo;
  let hi = viewportHi;
  for (const occluder of input.occluders) {
    if (occluder.right <= occluder.left || occluder.bottom <= occluder.top) {
      continue;
    }
    const intersectsBand =
      occluder.bottom > input.band.top && occluder.top < input.band.bottom;
    if (!intersectsBand) continue;
    const centerX = (occluder.left + occluder.right) / 2;
    if (centerX <= input.viewportWidth / 2) {
      lo = Math.max(lo, occluder.right + occluderGap);
    } else {
      hi = Math.min(hi, occluder.left - occluderGap - input.width);
    }
  }
  if (lo > hi) {
    lo = viewportLo;
    hi = viewportHi;
  }
  return clampNumber(input.idealLeft, lo, hi);
}

/**
 * Resolve the anchored position of every bar in the stack. See the module
 * header for the above → below → inside rules and the final viewport clamp.
 */
export function resolveAnchoredToolbarStack(
  input: AnchoredToolbarStackInput,
): AnchoredToolbarStack {
  const { box, bars, viewport } = input;
  if (bars.length === 0) return { placement: "above", bars: [] };
  const gap = input.gap ?? ANCHOR_GAP;
  const stackGap = input.stackGap ?? ANCHOR_STACK_GAP;
  const topInset = input.topInset ?? ANCHOR_TOP_INSET;
  const margin = input.margin ?? ANCHOR_VIEWPORT_MARGIN;
  const occluders = input.occluders ?? [];

  const stackHeight =
    bars.reduce((sum, bar) => sum + bar.height, 0) +
    stackGap * (bars.length - 1);
  const boxBottom = box.top + box.height;

  let placement: AnchorPlacement;
  const tops: number[] = new Array(bars.length);
  if (box.top - gap - stackHeight >= topInset) {
    // Above: bars[0] hugs the box top, later bars stack upward beyond it.
    placement = "above";
    let cursor = box.top - gap;
    for (let i = 0; i < bars.length; i += 1) {
      tops[i] = cursor - bars[i].height;
      cursor = tops[i] - stackGap;
    }
  } else if (boxBottom + gap + stackHeight <= viewport.height - margin) {
    // Below: bars[0] hugs the box bottom, later bars stack downward.
    placement = "below";
    let cursor = boxBottom + gap;
    for (let i = 0; i < bars.length; i += 1) {
      tops[i] = cursor;
      cursor = tops[i] + bars[i].height + stackGap;
    }
  } else {
    // Inside: neither edge has room — pin just inside the VISIBLE top edge
    // of the box (the edge with room), never above the topbar.
    placement = "inside";
    const visibleTop = Math.max(box.top, topInset);
    const visibleBottom = Math.min(boxBottom, viewport.height - margin);
    let cursor = clampNumber(
      visibleTop + gap,
      topInset,
      Math.max(topInset, visibleBottom - stackHeight),
    );
    for (let i = 0; i < bars.length; i += 1) {
      tops[i] = cursor;
      cursor = tops[i] + bars[i].height + stackGap;
    }
  }

  // Final safety clamp: shift the WHOLE stack (bars keep their relative
  // order) back into the vertical safe band, so a box scrolled off-screen
  // parks its actions at the nearest viewport edge instead of vanishing.
  let minTop = Infinity;
  let maxBottom = -Infinity;
  for (let i = 0; i < bars.length; i += 1) {
    minTop = Math.min(minTop, tops[i]);
    maxBottom = Math.max(maxBottom, tops[i] + bars[i].height);
  }
  let shift = 0;
  if (minTop < topInset) {
    shift = topInset - minTop;
  } else if (maxBottom > viewport.height - margin) {
    shift = Math.max(
      topInset - minTop,
      viewport.height - margin - maxBottom,
    );
  }

  const centerX = box.left + box.width / 2;
  const placed = bars.map((bar, i) => {
    const top = tops[i] + shift;
    const left = clampAnchoredBarLeft({
      idealLeft: centerX - bar.width / 2,
      width: bar.width,
      band: { top, bottom: top + bar.height },
      viewportWidth: viewport.width,
      occluders,
      margin,
    });
    return { top: Math.round(top), left: Math.round(left) };
  });
  return { placement, bars: placed };
}

export interface MenuShouldOpenUpInput {
  /** Viewport-y of the anchor bar's top edge. */
  anchorTop: number;
  /** Viewport-y of the anchor bar's bottom edge. */
  anchorBottom: number;
  viewportHeight: number;
  /** Worst-case menu height the decision plans for. */
  menuHeight?: number;
}

/**
 * Direction for a popup that hangs off an anchored bar. The bottom-docked
 * chip could hardcode "up"; an anchored bar can sit anywhere, so the menu
 * opens toward whichever side actually has room (below preferred — it
 * matches the reading direction — flipping up when below can't fit).
 */
export function menuShouldOpenUp(input: MenuShouldOpenUpInput): boolean {
  const menuHeight = input.menuHeight ?? 280;
  const roomBelow = input.viewportHeight - input.anchorBottom;
  const roomAbove = input.anchorTop - ANCHOR_TOP_INSET;
  if (roomBelow >= menuHeight + ANCHOR_VIEWPORT_MARGIN) return false;
  if (roomAbove >= menuHeight + ANCHOR_VIEWPORT_MARGIN) return true;
  return roomAbove > roomBelow;
}

// ── DOM half ────────────────────────────────────────────────────────────────

/**
 * Chrome that must not cover an anchored bar: left command dock, the
 * inspector tab rail, every floating panel/drawer shell (both sides — the
 * shell stamps `data-edit-panel-side`), the bottom-left zoom bar and the
 * nested-blocks panel (open or collapsed pill).
 */
export const ANCHOR_OCCLUDER_SELECTOR = [
  "[data-command-dock]",
  "[data-inspector-command-rail]",
  "[data-edit-panel-side]",
  '[data-edit-overlay="zoom-controls"]',
  "[data-builder-node-canvas-children]",
  "[data-builder-node-canvas-children-collapsed]",
].join(",");

/** Read the live occluder rects. `[]` outside the browser. */
export function measureAnchorOccluders(
  root: Document | null = typeof document === "undefined" ? null : document,
): AnchorOccluder[] {
  if (!root) return [];
  const out: AnchorOccluder[] = [];
  for (const el of Array.from(
    root.querySelectorAll<HTMLElement>(ANCHOR_OCCLUDER_SELECTOR),
  )) {
    // Present-but-closed shells keep rendering aria-hidden; skip them the
    // same way canvas-panel-clearance does.
    if (el.getAttribute("aria-hidden") === "true") continue;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    out.push({
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
    });
  }
  return out;
}

/**
 * Measure + place the given bar elements against `box` in one shot, writing
 * `style.top/left` directly (rAF-loop friendly: no React state). Also stamps
 * `data-anchor-placement` for QA. Null/absent elements are skipped, so the
 * caller can always pass its full candidate list.
 */
export function positionAnchoredToolbarStack(
  box: AnchorBox,
  elements: ReadonlyArray<HTMLElement | null | undefined>,
): void {
  if (typeof window === "undefined") return;
  const els = elements.filter((el): el is HTMLElement => !!el);
  if (els.length === 0) return;
  const placed = resolveAnchoredToolbarStack({
    box,
    bars: els.map((el) => ({ width: el.offsetWidth, height: el.offsetHeight })),
    viewport: { width: window.innerWidth, height: window.innerHeight },
    occluders: measureAnchorOccluders(),
  });
  for (let i = 0; i < els.length; i += 1) {
    const pos = placed.bars[i];
    if (!pos) continue;
    els[i].style.top = `${pos.top}px`;
    els[i].style.left = `${pos.left}px`;
    els[i].setAttribute("data-anchor-placement", placed.placement);
  }
}
