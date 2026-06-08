/**
 * Command dock ↔ left floating panel dock geometry — flush snap + merge styling.
 * Mirror of inspector-rail-dock.ts for the left command rail.
 */

import type { PanelOffset, SnapRect } from "./workspace-layout";

export const COMMAND_DOCK_RAIL_DOCK_THRESHOLD_PX = 18;
export const COMMAND_DOCK_RAIL_DOCK_MIN_OVERLAP = 0.42;

export function horizontalGapBetweenPanelAndCommandDock(
  panel: SnapRect,
  dock: SnapRect,
): number {
  return panel.left - (dock.left + dock.width);
}

export function verticalOverlapRatio(a: SnapRect, b: SnapRect): number {
  const top = Math.max(a.top, b.top);
  const bottom = Math.min(a.top + a.height, b.top + b.height);
  const overlap = Math.max(0, bottom - top);
  const minH = Math.min(a.height, b.height);
  return minH > 0 ? overlap / minH : 0;
}

export function shouldDockPanelToCommandDock(
  panel: SnapRect,
  dock: SnapRect,
  threshold = COMMAND_DOCK_RAIL_DOCK_THRESHOLD_PX,
): boolean {
  const gap = horizontalGapBetweenPanelAndCommandDock(panel, dock);
  if (Math.abs(gap) > threshold) return false;
  return verticalOverlapRatio(panel, dock) >= COMMAND_DOCK_RAIL_DOCK_MIN_OVERLAP;
}

/** Nudge panel translate so its left edge meets the dock's right edge. */
export function panelOffsetToDockFlushLeft(input: {
  panelRect: SnapRect;
  dockRect: SnapRect;
  currentOffset: PanelOffset;
}): PanelOffset {
  const gap = horizontalGapBetweenPanelAndCommandDock(
    input.panelRect,
    input.dockRect,
  );
  return {
    x: input.currentOffset.x - Math.round(gap),
    y: input.currentOffset.y,
  };
}

export interface MergedCommandDockChromeStyle {
  borderTopLeftRadius?: number | string;
  borderTopRightRadius?: number | string;
  borderBottomLeftRadius?: number | string;
  borderBottomRightRadius?: number | string;
  boxShadow?: string;
  transition?: string;
}

export function commandDockPanelDockStyle(
  docked: boolean,
  dragging: boolean,
  radiusPx: number,
  boxShadow: string,
): MergedCommandDockChromeStyle {
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
      /,\s*0 4px 14px[^)]+\)/,
      ", 0 4px 14px -8px rgba(17,24,39,0.08)",
    ),
    transition,
  };
}

export function commandDockRailDockStyle(
  docked: boolean,
  dragging: boolean,
  radiusPx: number,
  boxShadow: string,
): MergedCommandDockChromeStyle {
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
      /0 1px 2px[^,]+,\s*/,
      "",
    ),
    transition,
  };
}
