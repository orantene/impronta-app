/**
 * Inspector ↔ tab-rail dock geometry — flush snap + merge styling.
 */

import type { PanelOffset, SnapRect } from "./workspace-layout";

export const INSPECTOR_RAIL_DOCK_THRESHOLD_PX = 18;
export const INSPECTOR_RAIL_DOCK_MIN_OVERLAP = 0.42;

export function horizontalGapBetweenInspectorAndRail(
  inspector: SnapRect,
  rail: SnapRect,
): number {
  return rail.left - (inspector.left + inspector.width);
}

export function verticalOverlapRatio(a: SnapRect, b: SnapRect): number {
  const top = Math.max(a.top, b.top);
  const bottom = Math.min(a.top + a.height, b.top + b.height);
  const overlap = Math.max(0, bottom - top);
  const minH = Math.min(a.height, b.height);
  return minH > 0 ? overlap / minH : 0;
}

export function shouldDockInspectorToRail(
  inspector: SnapRect,
  rail: SnapRect,
  threshold = INSPECTOR_RAIL_DOCK_THRESHOLD_PX,
): boolean {
  const gap = horizontalGapBetweenInspectorAndRail(inspector, rail);
  if (Math.abs(gap) > threshold) return false;
  return verticalOverlapRatio(inspector, rail) >= INSPECTOR_RAIL_DOCK_MIN_OVERLAP;
}

/** Nudge inspector translate so its right edge meets the rail's left edge. */
export function inspectorOffsetToDockFlush(input: {
  inspectorRect: SnapRect;
  railRect: SnapRect;
  currentOffset: PanelOffset;
}): PanelOffset {
  const gap = horizontalGapBetweenInspectorAndRail(
    input.inspectorRect,
    input.railRect,
  );
  return {
    x: input.currentOffset.x + Math.round(gap),
    y: input.currentOffset.y,
  };
}

export interface MergedInspectorChromeStyle {
  borderTopLeftRadius?: number | string;
  borderTopRightRadius?: number | string;
  borderBottomLeftRadius?: number | string;
  borderBottomRightRadius?: number | string;
  boxShadow?: string;
  transition?: string;
}

export function inspectorPanelDockStyle(
  docked: boolean,
  dragging: boolean,
  radiusPx: number,
  boxShadow: string,
): MergedInspectorChromeStyle {
  const transition = dragging
    ? "none"
    : "border-radius 220ms ease, box-shadow 220ms ease, border-color 220ms ease";

  const roundAll = {
    borderTopLeftRadius: radiusPx,
    borderTopRightRadius: radiusPx,
    borderBottomLeftRadius: radiusPx,
    borderBottomRightRadius: radiusPx,
  };

  if (!docked) {
    return {
      ...roundAll,
      boxShadow,
      transition,
    };
  }

  return {
    ...roundAll,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    boxShadow: boxShadow.replace(
      /,\s*0 4px 14px[^)]+\)/,
      ", 0 4px 14px -8px rgba(17,24,39,0.08)",
    ),
    transition,
  };
}

export function inspectorRailDockStyle(
  docked: boolean,
  dragging: boolean,
  radiusPx: number,
  boxShadow: string,
): MergedInspectorChromeStyle {
  const transition = dragging
    ? "none"
    : "border-radius 220ms ease, box-shadow 220ms ease, border-color 220ms ease";

  const roundAll = {
    borderTopLeftRadius: radiusPx,
    borderTopRightRadius: radiusPx,
    borderBottomLeftRadius: radiusPx,
    borderBottomRightRadius: radiusPx,
  };

  if (!docked) {
    return {
      ...roundAll,
      boxShadow,
      transition,
    };
  }

  return {
    ...roundAll,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    boxShadow: boxShadow.replace(
      /0 1px 2px[^,]+,\s*/,
      "",
    ),
    transition,
  };
}
