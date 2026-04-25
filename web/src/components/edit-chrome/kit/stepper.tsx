"use client";

/**
 * Stepper — numeric input with −/+ buttons and a unit suffix.
 *
 * Used everywhere in the inspector: padding/margin per side, font size,
 * line-height, letter-spacing, blur radius, opacity, gap, time hour/minute,
 * etc. Visual rules from mockup `.stepper`:
 *   - 30px height, 1px border, surface-2 bg, inset top highlight
 *   - 24px square decrement / increment buttons on either side
 *   - centred input, tabular-nums, transparent bg
 *   - optional unit slot on the right (CAPS, muted, e.g. "px", "em", "%")
 *   - focus-within shifts border to --blue + 3px halo
 *
 * Numeric clamping: callers control min/max; this component just emits
 * the next number. Strings are passed through (so "auto" / "fit-content"
 * stay valid in css-style contexts where numeric semantics don't apply).
 */

import type { CSSProperties } from "react";

import { CHROME, CHROME_SHADOWS } from "./tokens";

interface StepperProps {
  value: number | string;
  onChange: (next: number | string) => void;
  /** Step delta. Defaults to 1. */
  step?: number;
  min?: number;
  max?: number;
  /** Unit suffix (px, em, vh, %, ms, ×). */
  unit?: string;
  /** Disable input + buttons. */
  disabled?: boolean;
  /** Override min-width — defaults to 80px. */
  width?: number | string;
  /** Render the −/+ buttons. Defaults to true. */
  showButtons?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function Stepper({
  value,
  onChange,
  step = 1,
  min,
  max,
  unit,
  disabled = false,
  width,
  showButtons = true,
  className,
  style,
}: StepperProps) {
  const clamp = (n: number) => {
    if (typeof min === "number" && n < min) return min;
    if (typeof max === "number" && n > max) return max;
    return n;
  };
  const numericValue = typeof value === "number" ? value : Number(value);
  const isNumeric = Number.isFinite(numericValue);

  return (
    <div
      className={`inline-flex items-stretch overflow-hidden ${className ?? ""}`}
      style={{
        height: 30,
        background: CHROME.surface2,
        border: `1px solid ${CHROME.lineMid}`,
        borderRadius: 6,
        boxShadow: CHROME_SHADOWS.inputInset,
        width,
        opacity: disabled ? 0.55 : 1,
        ...style,
      }}
      onFocusCapture={(e) => {
        e.currentTarget.style.borderColor = CHROME.blue;
        e.currentTarget.style.boxShadow = CHROME_SHADOWS.inputFocus;
      }}
      onBlurCapture={(e) => {
        e.currentTarget.style.borderColor = CHROME.lineMid;
        e.currentTarget.style.boxShadow = CHROME_SHADOWS.inputInset;
      }}
    >
      {showButtons ? (
        <button
          type="button"
          aria-label="Decrement"
          tabIndex={-1}
          disabled={disabled || (isNumeric && typeof min === "number" && numericValue <= min)}
          onClick={() => {
            if (!isNumeric) return;
            onChange(clamp(numericValue - step));
          }}
          className="inline-flex w-6 cursor-pointer items-center justify-center"
          style={{
            background: "transparent",
            border: "none",
            color: CHROME.muted,
            fontSize: 13,
          }}
          onMouseEnter={(e) => {
            if (disabled) return;
            e.currentTarget.style.background = CHROME.paper2;
            e.currentTarget.style.color = CHROME.ink;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = CHROME.muted;
          }}
        >
          −
        </button>
      ) : null}
      <input
        type="text"
        inputMode={isNumeric ? "numeric" : "text"}
        value={String(value)}
        disabled={disabled}
        onChange={(e) => {
          const raw = e.target.value.trim();
          const n = Number(raw);
          if (raw !== "" && Number.isFinite(n)) {
            onChange(clamp(n));
          } else {
            // Allow non-numeric strings (e.g. "auto") to pass through.
            onChange(raw);
          }
        }}
        className="min-w-[36px] flex-1 text-center"
        style={{
          background: "transparent",
          border: "none",
          outline: "none",
          fontFamily: "inherit",
          fontSize: 12.5,
          color: CHROME.ink,
          fontVariantNumeric: "tabular-nums",
          padding: 0,
        }}
      />
      {unit ? (
        <span
          className="inline-flex items-center pr-2 uppercase"
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: CHROME.muted2,
            letterSpacing: "0.04em",
          }}
        >
          {unit}
        </span>
      ) : null}
      {showButtons ? (
        <button
          type="button"
          aria-label="Increment"
          tabIndex={-1}
          disabled={disabled || (isNumeric && typeof max === "number" && numericValue >= max)}
          onClick={() => {
            if (!isNumeric) return;
            onChange(clamp(numericValue + step));
          }}
          className="inline-flex w-6 cursor-pointer items-center justify-center"
          style={{
            background: "transparent",
            border: "none",
            color: CHROME.muted,
            fontSize: 13,
          }}
          onMouseEnter={(e) => {
            if (disabled) return;
            e.currentTarget.style.background = CHROME.paper2;
            e.currentTarget.style.color = CHROME.ink;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = CHROME.muted;
          }}
        >
          +
        </button>
      ) : null}
    </div>
  );
}
