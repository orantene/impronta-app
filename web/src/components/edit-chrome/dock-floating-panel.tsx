"use client";

/**
 * DockFloatingPanel — shared chrome for left-dock-launched floating panels.
 *
 * Matches the mockup's Page Structure / Search / All Pages panels: white card,
 * grip handle, title row with close X, body scroll region. Anchored to the
 * right of the CommandDock via COMMAND_DOCK_PANEL_INSET_PX.
 */

import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";

import { COMMAND_DOCK_PANEL_INSET_PX } from "./command-dock";
import { useFloatingDrag } from "./floating-panel";
import {
  FLOATING_PANEL_MAX_HEIGHT,
  FLOATING_PANEL_TOP_PX,
  FloatingPanelShell,
  floatingPanelBoxShadow,
} from "./kit/floating-panel-shell";
import { CHROME } from "./kit";

export interface DockFloatingPanelProps {
  panelId: string;
  title: string;
  open: boolean;
  onClose: () => void;
  width?: number;
  tabs?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  testId?: string;
}

function PanelCloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      title="Close panel"
      aria-label="Close panel"
      className="inline-flex h-[28px] w-[28px] shrink-0 cursor-pointer items-center justify-center rounded-[8px] border-none transition-colors"
      style={{ background: "transparent", color: CHROME.muted }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = CHROME.paper2;
        e.currentTarget.style.color = CHROME.ink;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = CHROME.muted;
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}

export function DockFloatingPanel({
  panelId,
  title,
  open,
  onClose,
  width = 320,
  tabs,
  footer,
  children,
  testId,
}: DockFloatingPanelProps) {
  const floatingDrag = useFloatingDrag({ panelId });
  const moved = floatingDrag.offset.x !== 0 || floatingDrag.offset.y !== 0;

  if (!open) return null;

  return (
    <FloatingPanelShell
      panelId={panelId}
      side="left"
      width={width}
      open={open}
      testId={testId}
      dragLabel={title}
      setPanelNode={floatingDrag.setPanelNode}
      transform={floatingDrag.transform}
      dragging={floatingDrag.dragging}
      onHandlePointerDown={floatingDrag.onHandlePointerDown}
      moved={moved}
      onReset={floatingDrag.reset}
      dataEditDrawer={panelId}
      header={
        <div
          className="flex items-center justify-between gap-[8px] px-[14px] py-[10px]"
          style={{ borderBottom: `1px solid ${CHROME.line}` }}
        >
          <h2
            id={`${panelId}-title`}
            className="m-0 min-w-0 flex-1 truncate text-[13px] font-semibold tracking-[-0.01em]"
            style={{ color: CHROME.ink }}
          >
            {title}
          </h2>
          <PanelCloseButton onClose={onClose} />
        </div>
      }
      tabs={tabs}
      footer={footer}
      style={{
        left: COMMAND_DOCK_PANEL_INSET_PX,
        top: FLOATING_PANEL_TOP_PX,
        maxHeight: FLOATING_PANEL_MAX_HEIGHT,
        boxShadow: floatingPanelBoxShadow(floatingDrag.dragging),
      }}
    >
      {children}
    </FloatingPanelShell>
  );
}
