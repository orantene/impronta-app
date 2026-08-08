"use client";

/**
 * canvas-panel-clearance — where a bottom-left floating canvas panel is allowed
 * to sit so the left edit chrome never covers it.
 *
 * WAVE2-2.2. The nested-blocks popover was pinned at a literal `left: 14`,
 * the same gutter the zoom bar uses. The zoom bar is 42px tall and sits at the
 * very bottom, so it clears the left command dock by luck of geometry. The
 * popover is 208px tall and stacks ABOVE the zoom bar, so on any viewport short
 * enough for the dock rail to reach down that far (or with any left dock panel
 * open) its top rows render underneath the dock: header and first row clipped.
 *
 * Nudging the constant would only move the collision. The dock's width, the
 * navigator's width and the panel's own height are all independently variable
 * (the navigator is operator-resizable between 280 and 520px and every left
 * panel is draggable), so the only thing that stays correct is MEASURING what
 * is actually on the left and placing the panel to the right of it.
 *
 * The math is a pure function over rectangles (`resolveCanvasPanelPlacement`)
 * so it is unit-testable without a DOM; the DOM half is only
 * `measureLeftChromeOccluders`, which collects the rects.
 */

import { useLayoutEffect, useState } from "react";

/**
 * Everything anchored to the left edge that can cover canvas chrome: the
 * command dock rail plus any dock-launched floating panel (Structure, Pages,
 * Design, Assets, Add gallery). `data-edit-panel-side` is stamped by
 * `FloatingPanelShell`, so a new left panel is covered automatically.
 */
export const LEFT_CHROME_OCCLUDER_SELECTOR =
  '[data-command-dock],[data-edit-panel-side="left"]';

export interface ClearanceRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface CanvasPanelPlacementInput {
  /** Rects of the left chrome, viewport coordinates. */
  occluders: ReadonlyArray<ClearanceRect>;
  /** The vertical band the panel occupies, viewport coordinates. */
  band: { top: number; bottom: number };
  /** Viewport width in CSS px. */
  viewportWidth: number;
  /** Preferred panel width. */
  preferredWidth: number;
  /** Never render narrower than this; below it the panel is unusable. */
  minWidth: number;
  /** Home inset when nothing is in the way. */
  homeInset: number;
  /** Breathing room between the panel and whatever it clears. */
  gap: number;
  /** Right-edge gutter the panel must keep. */
  rightGutter: number;
}

export interface CanvasPanelPlacement {
  left: number;
  width: number;
}

/** Does a rect overlap the panel's vertical band at all? */
function intersectsBand(
  rect: ClearanceRect,
  band: { top: number; bottom: number },
): boolean {
  return rect.bottom > band.top && rect.top < band.bottom;
}

/**
 * Place a left-anchored floating panel so it never overlaps the left chrome.
 *
 * Candidate insets, most-preferred first:
 *   1. the home inset (nothing in the band is in the way);
 *   2. clear of EVERY occluder that reaches into the panel's vertical band;
 *   3. clear of the narrowest single occluder (the dock rail), for the squeeze
 *      case where a wide open panel leaves no usable room to its right.
 *
 * The first candidate that leaves at least `minWidth` of room wins, and the
 * width shrinks to the space actually available (capped at `preferredWidth`).
 * When nothing fits, the last candidate is used and clamped into the viewport:
 * a too-narrow panel is still better than one rendered off-screen, and the
 * caller hides the panel entirely below its own minimum viewport width.
 */
export function resolveCanvasPanelPlacement(
  input: CanvasPanelPlacementInput,
): CanvasPanelPlacement {
  const {
    occluders,
    band,
    viewportWidth,
    preferredWidth,
    minWidth,
    homeInset,
    gap,
    rightGutter,
  } = input;

  const inBand = occluders.filter(
    (rect) =>
      rect.right > rect.left && rect.bottom > rect.top && intersectsBand(rect, band),
  );

  const candidates: number[] = [homeInset];
  if (inBand.length > 0) {
    const widestRight = Math.max(...inBand.map((rect) => rect.right));
    candidates.push(widestRight + gap);
    if (inBand.length > 1) {
      const narrowestRight = Math.min(...inBand.map((rect) => rect.right));
      candidates.push(narrowestRight + gap);
    }
  }

  // A candidate is only viable if it also clears every in-band occluder that
  // starts to its left — `homeInset` fails that test whenever the dock reaches
  // into the band, which is exactly the reported bug.
  const clears = (left: number): boolean =>
    inBand.every((rect) => left >= rect.right || left + minWidth <= rect.left);

  let fallback: CanvasPanelPlacement | null = null;
  for (const left of candidates) {
    const available = viewportWidth - rightGutter - left;
    const placement: CanvasPanelPlacement = {
      left,
      width: Math.min(preferredWidth, Math.max(minWidth, available)),
    };
    if (fallback === null) fallback = placement;
    if (!clears(left)) continue;
    if (available >= minWidth) return placement;
    fallback = placement;
  }

  const resolved = fallback ?? { left: homeInset, width: preferredWidth };
  const maxLeft = Math.max(0, viewportWidth - rightGutter - resolved.width);
  return { left: Math.min(resolved.left, maxLeft), width: resolved.width };
}

/** Read the live left-chrome rects. Returns `[]` outside the browser. */
export function measureLeftChromeOccluders(
  root: Document | null = typeof document === "undefined" ? null : document,
): ClearanceRect[] {
  if (!root) return [];
  const out: ClearanceRect[] = [];
  for (const el of Array.from(
    root.querySelectorAll<HTMLElement>(LEFT_CHROME_OCCLUDER_SELECTOR),
  )) {
    // A shell that is present-but-closed still renders (aria-hidden), and a
    // display:none rail measures 0×0 — neither can occlude anything.
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

export interface UseCanvasPanelPlacementOptions {
  /** Skip all measurement while the panel is not rendered. */
  enabled: boolean;
  preferredWidth: number;
  minWidth: number;
  /** Panel height, used to derive the vertical band from `bottomOffset`. */
  height: number;
  /** Distance from the viewport bottom to the panel's bottom edge. */
  bottomOffset: number;
  homeInset: number;
  gap: number;
  rightGutter: number;
}

/**
 * Live placement for a bottom-left floating canvas panel.
 *
 * Measured in a layout effect that runs on EVERY render of the host, which is
 * what keeps it honest without an observer: the host (selection-layer) already
 * subscribes to `navigatorOpen` / `navigatorWidth`, so opening, closing or
 * resizing a left panel re-renders it and re-measures here. A window resize
 * listener covers the one state change React does not drive.
 */
export function useCanvasPanelPlacement(
  options: UseCanvasPanelPlacementOptions,
): CanvasPanelPlacement {
  const {
    enabled,
    preferredWidth,
    minWidth,
    height,
    bottomOffset,
    homeInset,
    gap,
    rightGutter,
  } = options;
  const [placement, setPlacement] = useState<CanvasPanelPlacement>({
    left: homeInset,
    width: preferredWidth,
  });

  useLayoutEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const measure = (): void => {
      const viewportHeight = window.innerHeight;
      const bottom = viewportHeight - bottomOffset;
      const next = resolveCanvasPanelPlacement({
        occluders: measureLeftChromeOccluders(),
        band: { top: bottom - height, bottom },
        viewportWidth: window.innerWidth,
        preferredWidth,
        minWidth,
        homeInset,
        gap,
        rightGutter,
      });
      setPlacement((prev) =>
        prev.left === next.left && prev.width === next.width ? prev : next,
      );
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  });

  return placement;
}
