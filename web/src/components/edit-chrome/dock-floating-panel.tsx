"use client";

/**
 * DockFloatingPanel — shared chrome for left-dock-launched floating panels.
 *
 * Matches the mockup's Page Structure / Search / All Pages panels: white card,
 * grip handle, title row with close X, body scroll region. Anchored to the
 * right of the CommandDock via COMMAND_DOCK_PANEL_INSET_PX.
 */

import type { DragEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";

import { COMMAND_DOCK_PANEL_INSET_PX } from "./command-dock";
import { useFloatingDrag } from "./floating-panel";
import {
  FLOATING_PANEL_MAX_HEIGHT,
  FLOATING_PANEL_TOP_PX,
  FloatingPanelShell,
  floatingPanelBoxShadow,
} from "./kit/floating-panel-shell";
import { CHROME, Z_INDEX } from "./kit";

/** Subset of {@link useFloatingDrag} return for panels that manage their own hook. */
export type FloatingDragBinding = ReturnType<typeof useFloatingDrag>;

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
  /** id on the title `<h2>` for `aria-labelledby`. */
  titleId?: string;
  closeAriaLabel?: string;
  /** Extra controls in the header row (before close). */
  headerExtra?: ReactNode;
  /** Slot below grip (e.g. navigator width resize rail). */
  afterHandle?: ReactNode;
  onDragLeave?: (event: DragEvent<HTMLElement>) => void;
  onDrop?: (event: DragEvent<HTMLElement>) => void;
  onDragOver?: (event: DragEvent<HTMLElement>) => void;
  /** Reuse an existing drag binding (navigator width + pin share one hook). */
  floatingDrag?: FloatingDragBinding;
  zIndex?: number;
  dataEditOverlay?: string;
}

function PanelCloseButton({
  onClose,
  ariaLabel = "Close panel",
}: {
  onClose: () => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClose}
      title={ariaLabel}
      aria-label={ariaLabel}
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
  titleId,
  closeAriaLabel,
  headerExtra,
  afterHandle,
  onDragLeave,
  onDrop,
  onDragOver,
  floatingDrag: floatingDragProp,
  zIndex = Z_INDEX.panels,
  dataEditOverlay,
}: DockFloatingPanelProps) {
  const internalDrag = useFloatingDrag({ panelId });
  const floatingDrag = floatingDragProp ?? internalDrag;
  const moved = floatingDrag.offset.x !== 0 || floatingDrag.offset.y !== 0;

  if (!open) return null;

  const resolvedTitleId = titleId ?? `${panelId}-title`;

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
      dataEditOverlay={dataEditOverlay}
      ariaLabelledBy={resolvedTitleId}
      zIndex={zIndex}
      afterHandle={afterHandle}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragOver={onDragOver}
      header={
        <div
          className="flex items-center justify-between gap-[8px] px-[14px] py-[10px]"
          style={{ borderBottom: tabs ? undefined : `1px solid ${CHROME.line}` }}
        >
          <h2
            id={resolvedTitleId}
            className="m-0 min-w-0 flex-1 truncate text-[13px] font-semibold tracking-[-0.01em]"
            style={{ color: CHROME.ink }}
          >
            {title}
          </h2>
          {headerExtra}
          <PanelCloseButton onClose={onClose} ariaLabel={closeAriaLabel} />
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
