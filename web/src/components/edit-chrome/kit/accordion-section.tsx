"use client";

/**
 * AccordionSection — a styled disclosure / accordion primitive that replaces
 * raw <details>/<summary> elements in the Code tab Power tools panel.
 *
 * Visually consistent with Card: white surface, subtle border + shadow,
 * rounded corners. The clickable header row matches CardHead's typography
 * (caps label, muted sub-line). The chevron rotates 90° when open.
 *
 * Controlled or uncontrolled:
 *   - Uncontrolled: pass `defaultOpen` (boolean) — manages its own open state.
 *   - Controlled: pass `open` + `onOpenChange`.
 */

import { useState, type ReactNode } from "react";

import { CHROME, CHROME_SHADOWS } from "./tokens";

interface AccordionSectionProps {
  title: string;
  /** Optional sub-line shown in muted tone after the title. */
  sub?: string;
  /** Optional leading icon (16×16). */
  icon?: ReactNode;
  /** Uncontrolled initial state. */
  defaultOpen?: boolean;
  /** Controlled open state. */
  open?: boolean;
  /** Controlled open state handler. */
  onOpenChange?: (next: boolean) => void;
  /** Extra margin below this section. Defaults to 8px. */
  marginBottom?: number;
  children: ReactNode;
  "data-theme-control"?: string;
}

export function AccordionSection({
  title,
  sub,
  icon,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  marginBottom = 8,
  children,
  "data-theme-control": dataThemeControl,
}: AccordionSectionProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const toggle = () => {
    const next = !open;
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  return (
    <div
      data-theme-control={dataThemeControl}
      style={{
        borderRadius: 8,
        border: `1px solid ${CHROME.line}`,
        background: CHROME.surface,
        boxShadow: CHROME_SHADOWS.card,
        overflow: "hidden",
        marginBottom,
      }}
    >
      {/* Header row */}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left"
        style={{
          padding: "10px 12px",
          cursor: "pointer",
          background: "transparent",
          border: "none",
          borderBottom: open ? `1px solid ${CHROME.line}` : "none",
          transition: "background 120ms",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = CHROME.paper;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
        }}
      >
        {icon ? (
          <span
            aria-hidden
            style={{ flexShrink: 0, color: CHROME.muted, lineHeight: 1 }}
          >
            {icon}
          </span>
        ) : null}
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: "block",
              fontSize: 12,
              fontWeight: 600,
              color: CHROME.ink,
              lineHeight: 1.3,
            }}
          >
            {title}
          </span>
          {sub ? (
            <span
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 400,
                color: CHROME.muted,
                marginTop: 1,
                lineHeight: 1.3,
              }}
            >
              {sub}
            </span>
          ) : null}
        </span>
        {/* Chevron */}
        <span
          aria-hidden
          style={{
            flexShrink: 0,
            fontSize: 11,
            color: CHROME.muted2,
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 200ms",
            lineHeight: 1,
          }}
        >
          ▶
        </span>
      </button>

      {/* Body */}
      {open ? (
        <div style={{ padding: "10px 12px" }}>{children}</div>
      ) : null}
    </div>
  );
}
