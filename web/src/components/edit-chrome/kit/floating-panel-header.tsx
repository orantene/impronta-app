"use client";

/**
 * FloatingPanelHeader — unified title row for left + right floating panels.
 *
 * Canvas-first contract: grip + 15px title + optional reset/extra + close X
 * on one row; optional meta block below (inspector block context).
 */

import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";

import { FloatingDragGrip } from "../floating-panel";
import { CHROME } from "./tokens";
import { FLOATING_PANEL_RADIUS_PX } from "./floating-panel-shell";

export function FloatingPanelCloseButton({
  onClose,
  ariaLabel = "Close panel",
}: {
  onClose: () => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      data-no-drag
      onClick={onClose}
      title={ariaLabel}
      aria-label={ariaLabel}
      className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border-none transition-colors"
      style={{ background: "transparent", color: CHROME.muted }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = CHROME.paper;
        e.currentTarget.style.color = CHROME.ink;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = CHROME.muted;
      }}
    >
      <svg
        width="16"
        height="16"
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

function FloatingPanelResetButton({ onReset }: { onReset: () => void }) {
  return (
    <button
      type="button"
      data-no-drag
      onClick={onReset}
      title="Snap back to home position"
      aria-label="Snap panel back to home position"
      className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border-none transition-colors"
      style={{ background: "transparent", color: CHROME.muted }}
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
        <path d="M3 3v5h5" />
      </svg>
    </button>
  );
}

export interface FloatingPanelHeaderProps {
  titleId: string;
  title: string;
  onPointerDown: (event: ReactPointerEvent) => void;
  dragging?: boolean;
  moved?: boolean;
  onReset?: () => void;
  onClose?: () => void;
  closeAriaLabel?: string;
  /** Trailing controls before close (e.g. save chip, perf badge). */
  headerExtra?: ReactNode;
  /** Sub-line under the title row (inspector block meta). */
  meta?: ReactNode;
  /** When true, meta can wrap to multiple lines. */
  metaWrap?: boolean;
  /** Bottom border on the title row when tabs/meta follow. */
  titleRowBorder?: boolean;
  /** Flatten top-right corner when docked to tab rail. */
  dockedToRail?: boolean;
}

export function FloatingPanelHeader({
  titleId,
  title,
  onPointerDown,
  dragging = false,
  moved = false,
  onReset,
  onClose,
  closeAriaLabel,
  headerExtra,
  meta,
  metaWrap = false,
  titleRowBorder = true,
  dockedToRail = false,
}: FloatingPanelHeaderProps) {
  return (
    <header
      style={{
        background: CHROME.surface,
        borderBottom: titleRowBorder && !meta ? `1px solid ${CHROME.line}` : undefined,
      }}
    >
      <div
        data-floating-drag-handle=""
        onPointerDown={onPointerDown}
        className="flex items-center gap-2.5 px-[18px] py-[14px]"
        style={{
          cursor: dragging ? "grabbing" : "grab",
          touchAction: "none",
          color: CHROME.muted,
          background: CHROME.surface,
          borderTopLeftRadius: FLOATING_PANEL_RADIUS_PX,
          borderTopRightRadius: dockedToRail ? 0 : FLOATING_PANEL_RADIUS_PX,
          transition: "border-radius 220ms ease",
        }}
      >
        <FloatingDragGrip dragging={dragging} />
        <h2
          id={titleId}
          className="m-0 min-w-0 truncate font-semibold tracking-[-0.01em]"
          style={{ color: CHROME.ink, fontSize: 15, fontWeight: 600 }}
        >
          {title}
        </h2>
        <span className="min-w-0 flex-1" />
        {moved && onReset ? <FloatingPanelResetButton onReset={onReset} /> : null}
        {headerExtra ? <span data-no-drag>{headerExtra}</span> : null}
        {onClose ? (
          <FloatingPanelCloseButton onClose={onClose} ariaLabel={closeAriaLabel} />
        ) : null}
      </div>
      {meta ? (
        <div
          className={`px-[18px] pb-[14px] ${metaWrap ? "" : "truncate"}`}
          style={{
            fontSize: 11,
            color: CHROME.muted,
            borderBottom: titleRowBorder ? `1px solid ${CHROME.line}` : undefined,
          }}
        >
          {meta}
        </div>
      ) : null}
    </header>
  );
}
