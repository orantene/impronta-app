"use client";

/**
 * FloatingPanelShell — unified white floating card chrome for builder panels.
 *
 * Used by the Layers navigator, inspector dock, and utility drawers (Theme,
 * Publish, Page settings, …) so left and right panels share the same visual
 * language: white surface, rounded corners, grip handle, magnet drag.
 */

import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";

import { FloatingDragHandle } from "../floating-panel";
import { commandDockPanelDockStyle } from "../command-dock-rail-dock";
import { inspectorPanelDockStyle } from "../inspector-rail-dock";
import { CHROME, EDIT_TOPBAR_H, Z_INDEX } from "./tokens";

export const FLOATING_PANEL_TOP_PX = EDIT_TOPBAR_H + 12;
export const FLOATING_PANEL_SIDE_INSET_PX = 14;
export const FLOATING_PANEL_MAX_HEIGHT = `calc(100vh - ${EDIT_TOPBAR_H + 24}px)`;
export const FLOATING_PANEL_RADIUS_PX = 16;

export function floatingPanelBoxShadow(dragging: boolean): string {
  return dragging
    ? "0 30px 70px -20px rgba(17,24,39,0.45), 0 10px 26px -10px rgba(17,24,39,0.26)"
    : "0 18px 50px -20px rgba(17,24,39,0.26), 0 4px 14px -8px rgba(17,24,39,0.14)";
}

export interface FloatingPanelShellProps {
  /** Stable id for workspace pin / magnet (optional). */
  panelId?: string;
  side: "left" | "right";
  width: number | string;
  open?: boolean;
  zIndex?: number;
  testId?: string;
  /** Grip strip label (e.g. "Layers", "Theme"). Omit when the grip lives in `header`. */
  dragLabel?: string;
  /** When false, skips the top drag strip (grip is rendered inside `header` instead). */
  showDragStrip?: boolean;
  /** Measured panel node ref for magnet + pin. */
  setPanelNode?: (node: HTMLElement | null) => void;
  transform?: string;
  dragging?: boolean;
  onHandlePointerDown?: (event: ReactPointerEvent) => void;
  moved?: boolean;
  onReset?: () => void;
  /** Content between grip handle and body (e.g. navigator resize rail). */
  afterHandle?: ReactNode;
  /** Optional header row below the grip (title/meta lives in DrawerHead). */
  header?: ReactNode;
  /** Tab strip slot. */
  tabs?: ReactNode;
  /** Footer slot. */
  footer?: ReactNode;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  /** data-edit-drawer kind or overlay id for QA. */
  dataEditDrawer?: string;
  dataEditOverlay?: string;
  ariaLabelledBy?: string;
  /** A11Y-1 — ARIA role; set to "dialog" when the panel is a modal drawer. */
  role?: "dialog";
  /** A11Y-1 — marks the panel modal for assistive tech (paired with role). */
  ariaModal?: boolean;
  onDragLeave?: (event: import("react").DragEvent<HTMLElement>) => void;
  onDrop?: (event: import("react").DragEvent<HTMLElement>) => void;
  onDragOver?: (event: import("react").DragEvent<HTMLElement>) => void;
  /**
   * On viewports below 1024px, anchor as a bottom sheet instead of a
   * floating side panel (compact editing mode).
   */
  compactBottomSheetBelowLg?: boolean;
  /** Override default side inset (e.g. inspector panel left of tab rail). */
  sideInsetPx?: number;
  /** Merged dock styling when inspector panel locks to tab rail. */
  dockedToRail?: boolean;
  /** Which edge the tab rail sits on when {@link dockedToRail} is true. */
  dockRailSide?: "left" | "right";
  /** Override fixed `top` (inspector uses {@link INSPECTOR_CHROME_TOP_PX}). */
  topPx?: number;
}

export function FloatingPanelShell({
  side,
  width,
  open = true,
  zIndex = Z_INDEX.panels,
  testId,
  dragLabel,
  showDragStrip = true,
  panelId,
  setPanelNode,
  transform = "translate(0px, 0px)",
  dragging = false,
  onHandlePointerDown,
  moved = false,
  onReset,
  afterHandle,
  header,
  tabs,
  footer,
  className,
  style,
  children,
  dataEditDrawer,
  ariaLabelledBy,
  role,
  ariaModal,
  compactBottomSheetBelowLg = false,
  sideInsetPx,
  dockedToRail = false,
  dockRailSide = "right",
  topPx = FLOATING_PANEL_TOP_PX,
  dataEditOverlay,
  onDragLeave,
  onDrop,
  onDragOver,
}: FloatingPanelShellProps) {
  const resolvedWidth = typeof width === "number" ? `${width}px` : width;
  const inset = sideInsetPx ?? FLOATING_PANEL_SIDE_INSET_PX;
  const horizontalAnchor =
    side === "left"
      ? { left: inset, right: undefined }
      : { right: inset, left: undefined };
  const panelShadow = floatingPanelBoxShadow(dragging);
  const dockStyle =
    dockRailSide === "left"
      ? commandDockPanelDockStyle(
          dockedToRail,
          dragging,
          FLOATING_PANEL_RADIUS_PX,
          panelShadow,
        )
      : inspectorPanelDockStyle(
          dockedToRail,
          dragging,
          FLOATING_PANEL_RADIUS_PX,
          panelShadow,
        );
  const panelBorder = `1px solid ${CHROME.line}`;
  const dockedOnLeft = dockedToRail && dockRailSide === "left";
  const dockedOnRight = dockedToRail && dockRailSide === "right";

  return (
    <aside
      ref={setPanelNode}
      data-edit-drawer={dataEditDrawer}
      data-edit-overlay={dataEditOverlay}
      data-edit-drawer-floating=""
      // WAVE2-2.2 — which viewport edge this panel is anchored to. Floating
      // canvas chrome (the nested-blocks popover) measures the LEFT-anchored
      // panels to place itself clear of them, so the marker has to be on the
      // shell, not on each caller.
      data-edit-panel-side={side}
      data-edit-float-panel-id={panelId}
      data-testid={testId}
      role={role}
      aria-modal={ariaModal}
      aria-labelledby={ariaLabelledBy}
      // A modal dialog must not be aria-hidden while open.
      aria-hidden={role === "dialog" ? (open ? undefined : true) : !open}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragOver={onDragOver}
      className={`fixed flex flex-col font-sans ${
        compactBottomSheetBelowLg
          ? "max-lg:!bottom-0 max-lg:!left-0 max-lg:!right-0 max-lg:!top-auto max-lg:!h-[min(55vh,520px)] max-lg:!w-full max-lg:!max-h-none max-lg:rounded-b-none max-lg:rounded-t-[16px]"
          : ""
      } ${className ?? ""}`}
      style={{
        top: topPx,
        ...horizontalAnchor,
        maxHeight: FLOATING_PANEL_MAX_HEIGHT,
        width: resolvedWidth,
        background: CHROME.surface,
        borderTop: panelBorder,
        borderBottom: panelBorder,
        borderLeft: dockedOnLeft ? "none" : panelBorder,
        borderRight: dockedOnRight ? "none" : panelBorder,
        ...dockStyle,
        zIndex,
        overflow: "hidden",
        pointerEvents: open ? "auto" : "none",
        opacity: open ? 1 : 0,
        transform,
        transition: dragging
          ? dockStyle.transition ?? "none"
          : `${dockStyle.transition ?? ""}, opacity 160ms ease`.replace(/^, /, ""),
        userSelect: dragging ? "none" : undefined,
        ...style,
      }}
    >
      {showDragStrip && onHandlePointerDown ? (
        <FloatingDragHandle
          onPointerDown={onHandlePointerDown}
          dragging={dragging}
          label={dragLabel}
          moved={moved}
          onReset={onReset}
          style={{
            color: CHROME.muted,
            background: CHROME.surface,
            width: "100%",
            boxSizing: "border-box",
            borderTopLeftRadius: dockedOnLeft ? 0 : FLOATING_PANEL_RADIUS_PX,
            borderTopRightRadius: dockedOnRight ? 0 : FLOATING_PANEL_RADIUS_PX,
            height: 32,
            transition: "border-radius 220ms ease",
          }}
        />
      ) : null}
      {afterHandle}
      {header}
      {tabs}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      {footer}
    </aside>
  );
}
