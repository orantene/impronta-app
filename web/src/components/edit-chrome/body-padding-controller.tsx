"use client";

/**
 * BodyPaddingController — lateral body padding so persistent chrome rails
 * (command dock + inspector tab rail) sit beside the storefront, not over it.
 *
 * TUL-397: must apply at every viewport width. Gating at min-width 1024 left
 * the rails over the live canvas at 768/390 (run-6 desktop device tier).
 */

import {
  COMMAND_DOCK_LEFT_PX,
  COMMAND_DOCK_PANEL_GAP_PX,
  COMMAND_DOCK_WIDTH_PX,
  INSPECTOR_PANEL_RIGHT_INSET_PX,
} from "./kit";
import { resolveDesktopCanvasRailGutters } from "./hero-shift-measure";
import {
  resolveBodyHorizontalPadding,
  type WorkspaceCanvasMode,
} from "./workspace-layout";

const COMMAND_DOCK_MIN_SAFE_LEFT_PX =
  COMMAND_DOCK_LEFT_PX + COMMAND_DOCK_WIDTH_PX + COMMAND_DOCK_PANEL_GAP_PX;
const INSPECTOR_RAIL_MIN_SAFE_RIGHT_PX = INSPECTOR_PANEL_RIGHT_INSET_PX;

export function BodyPaddingController({
  canvasMode,
  navigatorOpen,
  navigatorWidth,
  inspectorOpen,
  previewing,
}: {
  canvasMode: WorkspaceCanvasMode;
  navigatorOpen: boolean;
  navigatorWidth: number;
  inspectorOpen: boolean;
  /** Preview mode hides both rails entirely — no gutter to reserve then. */
  previewing: boolean;
}) {
  const panel = resolveBodyHorizontalPadding({
    mode: canvasMode,
    navigatorOpen,
    navigatorWidth,
    inspectorOpen,
  });
  const { left: effectiveLeft, right: effectiveRight } =
    resolveDesktopCanvasRailGutters({
      previewing,
      panelLeft: panel.left,
      panelRight: panel.right,
      commandDockSafeLeftPx: COMMAND_DOCK_MIN_SAFE_LEFT_PX,
      inspectorRailSafeRightPx: INSPECTOR_RAIL_MIN_SAFE_RIGHT_PX,
    });
  if (effectiveLeft === 0 && effectiveRight === 0) return null;
  return (
    <style>{`body { padding-left: ${effectiveLeft}px !important; padding-right: ${effectiveRight}px !important; transition: padding-left 200ms ease, padding-right 200ms ease; }`}</style>
  );
}
