"use client";

/**
 * SelectDropdown — a styled native <select> wrapper that matches the
 * ColorRow / Segmented visual language.
 *
 * Inspector Reset P5: retoned off the khaki `CHROME.controlBorder`
 * (#cfc7b6) onto `CHROME.lineStrong` — the same cool edge `NumberUnit`
 * (kit/number-unit.tsx) and `InspectorSelect` (inspectors/kit/inspector-ui.tsx)
 * use, so every "select" control in the editor shares one border language.
 * Still CHROME.controlFill for the fill, and the standard inputInset +
 * inputFocus shadow treatment on focus.
 *
 * A custom chevron is injected via a CSS background-image so the native
 * arrow is hidden across browsers. This keeps the styling purely CSS —
 * no pointer-events wrapper needed.
 */

import type { CSSProperties } from "react";

import { CHROME, CHROME_SHADOWS } from "./tokens";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectDropdownProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<SelectOption>;
  /** Additional option groups prepended before the main list. */
  leadingOptions?: ReadonlyArray<SelectOption>;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  "data-theme-control"?: string;
}

export function SelectDropdown({
  id,
  value,
  onChange,
  options,
  leadingOptions,
  disabled = false,
  className,
  style,
  "data-theme-control": dataThemeControl,
}: SelectDropdownProps) {
  return (
    <div
      className={`relative ${className ?? ""}`}
      style={{ display: "inline-flex", width: "100%", ...style }}
    >
      <select
        id={id}
        value={value}
        disabled={disabled}
        data-theme-control={dataThemeControl}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none"
        style={{
          padding: "6px 28px 6px 9px",
          border: `1px solid ${CHROME.lineStrong}`,
          borderRadius: 6,
          background: CHROME.controlFill,
          boxShadow: CHROME_SHADOWS.inputInset,
          fontFamily: "inherit",
          fontSize: 12,
          color: disabled ? CHROME.muted2 : CHROME.ink,
          cursor: disabled ? "not-allowed" : "pointer",
          outline: "none",
          transition: "border-color 120ms, box-shadow 120ms",
          // `appearance-none` Tailwind class handles cross-browser;
          // WebkitAppearance is an extra belt-and-braces for older Safari.
          WebkitAppearance: "none",
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = CHROME.blue;
          e.currentTarget.style.boxShadow = CHROME_SHADOWS.inputFocus;
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = CHROME.lineStrong;
          e.currentTarget.style.boxShadow = CHROME_SHADOWS.inputInset;
        }}
      >
        {leadingOptions?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {/* Chevron icon — sits on top of the select, pointer-events:none so
          clicks still land on the native <select> below it. */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          right: 8,
          top: "50%",
          transform: "translateY(-50%)",
          pointerEvents: "none",
          color: CHROME.muted2,
          lineHeight: 1,
          fontSize: 10,
        }}
      >
        ▾
      </span>
    </div>
  );
}
