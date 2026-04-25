"use client";

/**
 * Toggle — iOS-style on/off switch.
 *
 * Used by Page Settings (allow indexing, sitemap) and Theme settings
 * (respect prefers-reduced-motion). Visual rules from mockup:
 *   - 30×18 track, 14×14 thumb with soft shadow
 *   - off: track --line-mid grey
 *   - on: track --blue
 *   - 120ms ease for both background + thumb position
 *
 * Composes with a label + helper line — see how it's used in the
 * mockup's Page settings card.
 */

import type { ReactNode } from "react";

import { CHROME } from "./tokens";

interface ToggleProps {
  on: boolean;
  onChange: (next: boolean) => void;
  /** Optional label rendered to the right of the switch. */
  label?: ReactNode;
  /** Optional helper text rendered below the label. */
  helper?: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function Toggle({
  on,
  onChange,
  label,
  helper,
  disabled = false,
  className,
}: ToggleProps) {
  if (label || helper) {
    return (
      <div className={`flex items-center gap-2.5 ${className ?? ""}`}>
        <Switch on={on} onChange={onChange} disabled={disabled} />
        <div className="min-w-0 flex-1">
          {label ? (
            <div
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: CHROME.ink,
              }}
            >
              {label}
            </div>
          ) : null}
          {helper ? (
            <div
              style={{
                fontSize: 11,
                color: CHROME.muted,
                marginTop: 2,
                lineHeight: 1.4,
              }}
            >
              {helper}
            </div>
          ) : null}
        </div>
      </div>
    );
  }
  return (
    <Switch
      on={on}
      onChange={onChange}
      disabled={disabled}
      className={className}
    />
  );
}

function Switch({
  on,
  onChange,
  disabled,
  className,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex shrink-0 cursor-pointer ${className ?? ""}`}
      style={{
        width: 30,
        height: 18,
        background: on ? CHROME.blue : CHROME.lineMid,
        border: "none",
        borderRadius: 999,
        padding: 0,
        opacity: disabled ? 0.5 : 1,
        transition: "background 120ms",
      }}
    >
      <span
        aria-hidden
        className="absolute"
        style={{
          top: 2,
          left: on ? 14 : 2,
          width: 14,
          height: 14,
          background: "white",
          borderRadius: "50%",
          boxShadow: "0 1px 2px rgba(0,0,0,0.20)",
          transition: "left 120ms",
        }}
      />
    </button>
  );
}
