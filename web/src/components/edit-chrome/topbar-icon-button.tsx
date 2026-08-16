"use client";

/**
 * TbIconBtn — the editor topbar's icon button.
 *
 * Extracted verbatim from `topbar.tsx` so buttons can live in their own
 * modules instead of piling onto a file that is already on the size ratchet
 * (`src/lib/quality/file-size-ratchet.static.test.ts`). Call sites in the
 * topbar are unchanged; they import the same name they used to define.
 *
 * Sizing constants live here too because a button module that cannot state
 * its own glyph size is not self-contained — `topbar.tsx` re-imports
 * TB_ICON_PX for the inline SVGs it still owns.
 */

import type React from "react";

import { CHROME } from "./kit/tokens";

/** Glyph size for every topbar icon. */
export const TB_ICON_PX = 18;

export interface TbIconBtnProps {
  title: string;
  ariaLabel?: string;
  id?: string;
  ariaExpanded?: boolean;
  ariaHaspopup?: boolean | "menu" | "dialog";
  ariaControls?: string;
  onClick?: () => void;
  disabled?: boolean;
  badge?: number;
  /**
   * #14 — optional short text label shown below the icon (10px, muted).
   * Pass a 1–2 word label for right-cluster action buttons where the glyph
   * alone is ambiguous. Omit for undo/redo and other utility buttons where
   * the tooltip is sufficient and horizontal space is tight.
   */
  label?: string;
  children: React.ReactNode;
}

export function TbIconBtn({
  title,
  ariaLabel,
  id,
  ariaExpanded,
  ariaHaspopup,
  ariaControls,
  onClick,
  disabled,
  badge,
  label,
  children,
}: TbIconBtnProps) {
  return (
    <button
      type="button"
      id={id}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel ?? title}
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaHaspopup}
      aria-controls={ariaControls}
      className="relative inline-flex shrink-0 cursor-pointer items-center rounded-[10px] border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]/45 disabled:cursor-not-allowed"
      style={{
        width: label ? 48 : 40,
        height: 40,
        flexDirection: label ? "column" : "row",
        justifyContent: "center",
        gap: label ? 1 : undefined,
        background: "transparent",
        color: CHROME.muted,
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = CHROME.paper2;
          e.currentTarget.style.color = CHROME.ink;
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = disabled ? CHROME.muted3 : CHROME.muted;
      }}
    >
      {children}
      {label ? (
        <span
          aria-hidden
          style={{
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: "0.02em",
            lineHeight: 1,
            color: "inherit",
            pointerEvents: "none",
          }}
        >
          {label}
        </span>
      ) : null}
      {badge != null && badge > 0 ? (
        <span
          aria-hidden
          className="pointer-events-none absolute right-[1px] top-[1px] inline-flex min-w-[14px] items-center justify-center rounded-[7px] px-[3px] text-[9px] font-bold text-white"
          style={{
            height: 14,
            background: CHROME.rose,
            border: `1.5px solid ${CHROME.surface}`,
          }}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}
