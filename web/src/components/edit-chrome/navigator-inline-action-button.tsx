"use client";

/**
 * Shared ghost icon button used by the Structure navigator's inline row
 * actions (move / duplicate / paste / add / eye). Extracted so the panel can
 * stay under its line budget while Free-plan structure locks thread through.
 */

import { useState, type MouseEventHandler, type ReactNode } from "react";

import { CHROME } from "./kit";

export const NAVIGATOR_ACTION_ICON_SIZE = 15;

export function NodeInlineActionButton({
  children,
  label,
  onClick,
  disabled,
  inverted = false,
  compact = false,
  dataAttr,
  ariaExpanded,
  tabIndex,
}: {
  children: ReactNode;
  label: string;
  onClick: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  inverted?: boolean;
  compact?: boolean;
  dataAttr?: string;
  ariaExpanded?: boolean;
  tabIndex?: number;
}) {
  const dataProps = dataAttr ? { [dataAttr]: "true" } : {};
  // Affordance states: ghost at rest (so a cluster of these reads as clean
  // icons, not a wall of gray squares), soft indigo tint on hover/focus,
  // a deeper tint + slight press-scale on active. Gives unmistakable
  // "this is a button and I just clicked it" feedback the panel was missing.
  const [hover, setHover] = useState(false);
  const [active, setActive] = useState(false);
  const interactive = !disabled;
  const lit = interactive && (hover || active);
  // Reads as a real button at rest (subtle fill + hairline), strengthens on
  // hover, presses on active. Consistent whether it sits bare on the row or
  // inside the hover toolbar.
  const background = disabled
    ? "transparent"
    : active
      ? "rgba(42,49,71,0.20)"
      : hover
        ? "rgba(42,49,71,0.13)"
        : inverted
          ? "rgba(42,49,71,0.12)"
          : "rgba(42,49,71,0.06)";
  const borderColor = disabled
    ? "transparent"
    : lit
      ? "rgba(42,49,71,0.22)"
      : "rgba(42,49,71,0.12)";
  const color = disabled
    ? CHROME.muted2
    : lit || inverted
      ? CHROME.accent
      : CHROME.muted2;
  const dim = compact ? 22 : 22;
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={ariaExpanded}
      title={label}
      disabled={disabled}
      tabIndex={tabIndex}
      draggable={false}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
      onMouseDown={(event) => {
        event.stopPropagation();
        if (interactive) setActive(true);
      }}
      onMouseUp={() => setActive(false)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setActive(false);
      }}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      onDragStart={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={onClick}
      {...dataProps}
      style={{
        width: dim,
        height: dim,
        boxSizing: "border-box",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 6,
        border: `1px solid ${borderColor}`,
        background,
        color,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        padding: 0,
        flexShrink: 0,
        fontSize: compact ? 11 : 12,
        transition:
          "background 110ms ease, color 110ms ease, border-color 110ms ease, transform 90ms ease",
        transform: active ? "scale(0.9)" : "scale(1)",
      }}
    >
      {children}
    </button>
  );
}
