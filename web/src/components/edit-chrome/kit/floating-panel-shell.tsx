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
import { CHROME, Z_INDEX } from "./tokens";

export const FLOATING_PANEL_TOP_PX = 66;
export const FLOATING_PANEL_SIDE_INSET_PX = 14;
export const FLOATING_PANEL_MAX_HEIGHT = "calc(100vh - 84px)";
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
  /** Grip strip label (e.g. "Layers", "Theme"). */
  dragLabel?: string;
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
  onDragLeave?: (event: import("react").DragEvent<HTMLElement>) => void;
  onDrop?: (event: import("react").DragEvent<HTMLElement>) => void;
  onDragOver?: (event: import("react").DragEvent<HTMLElement>) => void;
  /**
   * On viewports below 1024px, anchor as a bottom sheet instead of a
   * floating side panel (compact editing mode).
   */
  compactBottomSheetBelowLg?: boolean;
}

export function FloatingPanelShell({
  side,
  width,
  open = true,
  zIndex = Z_INDEX.panels,
  testId,
  dragLabel,
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
  compactBottomSheetBelowLg = false,
  dataEditOverlay,
  onDragLeave,
  onDrop,
  onDragOver,
}: FloatingPanelShellProps) {
  const resolvedWidth = typeof width === "number" ? `${width}px` : width;
  const horizontalAnchor =
    side === "left"
      ? { left: FLOATING_PANEL_SIDE_INSET_PX, right: undefined }
      : { right: FLOATING_PANEL_SIDE_INSET_PX, left: undefined };

  return (
    <aside
      ref={setPanelNode}
      data-edit-drawer={dataEditDrawer}
      data-edit-overlay={dataEditOverlay}
      data-edit-drawer-floating=""
      data-edit-float-panel-id={panelId}
      data-testid={testId}
      aria-labelledby={ariaLabelledBy}
      aria-hidden={!open}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragOver={onDragOver}
      className={`fixed flex flex-col font-sans ${
        compactBottomSheetBelowLg
          ? "max-lg:!bottom-0 max-lg:!left-0 max-lg:!right-0 max-lg:!top-auto max-lg:!h-[min(55vh,520px)] max-lg:!w-full max-lg:!max-h-none max-lg:rounded-b-none max-lg:rounded-t-[16px]"
          : ""
      } ${className ?? ""}`}
      style={{
        top: FLOATING_PANEL_TOP_PX,
        ...horizontalAnchor,
        maxHeight: FLOATING_PANEL_MAX_HEIGHT,
        width: resolvedWidth,
        background: CHROME.surface,
        border: `1px solid ${CHROME.line}`,
        borderRadius: FLOATING_PANEL_RADIUS_PX,
        boxShadow: floatingPanelBoxShadow(dragging),
        zIndex,
        overflow: "hidden",
        pointerEvents: open ? "auto" : "none",
        opacity: open ? 1 : 0,
        transform,
        transition: dragging ? "none" : "box-shadow 180ms ease, opacity 160ms ease",
        userSelect: dragging ? "none" : undefined,
        ...style,
      }}
    >
      {onHandlePointerDown ? (
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
            borderTopLeftRadius: FLOATING_PANEL_RADIUS_PX,
            borderTopRightRadius: FLOATING_PANEL_RADIUS_PX,
            height: 32,
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
