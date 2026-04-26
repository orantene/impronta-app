"use client";

/**
 * NumberUnit — value + unit-picker primitive.
 *
 * Phase 1 of the page-builder vision roadmap (pixel-first foundation):
 * everywhere the editor previously offered a finite enum (Tight / Standard /
 * Airy paddingTop), we now expose this primitive as the "Custom value"
 * disclosure. Users escape the preset stepper into raw values whenever they
 * want pixel-level control. Tokens stay the default; pixels are one click away.
 *
 * Visual rules (continuous with `Stepper` and `Field`):
 *   - 30px height, 1px border, surface-2 bg, inset top highlight
 *   - centred numeric input, tabular-nums
 *   - unit picker on the right (px / rem / em / % / vw / vh) — small toggle
 *     dropdown rendered as a button + popover. Clicking cycles through
 *     allowed units; or click + hold opens the full list.
 *   - focus-within: blue border + halo
 *
 * Out-of-band values:
 *   - empty string → returns null via onChange (caller treats as "unset")
 *   - non-numeric input → ignored (input rejects)
 *
 * Why a single control rather than Stepper + Segmented:
 *   The unit + value belong together semantically (50px ≠ 50%); separating
 *   them risks "I changed value, forgot to change unit" mistakes. One
 *   control = one decision.
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";

import { CHROME, CHROME_SHADOWS } from "./tokens";

export type LengthUnit = "px" | "rem" | "em" | "%" | "vw" | "vh";

export const ALL_UNITS: readonly LengthUnit[] = [
  "px",
  "rem",
  "em",
  "%",
  "vw",
  "vh",
] as const;

export interface LengthValue {
  value: number;
  unit: LengthUnit;
}

interface NumberUnitProps {
  /** The current value, or null if unset (theme default). */
  value: LengthValue | null;
  /** Called with the new value, or null to clear back to theme default. */
  onChange: (next: LengthValue | null) => void;
  /** Restrict the unit picker (e.g. only px+rem for spacing). Defaults to all. */
  units?: readonly LengthUnit[];
  /** Default unit when transitioning from null → value. Defaults to first allowed unit. */
  defaultUnit?: LengthUnit;
  /** Step delta for arrow keys / +/- buttons. Defaults to 1. */
  step?: number;
  min?: number;
  max?: number;
  /** Placeholder shown when value is null (e.g. "—" or "auto" or theme value). */
  placeholder?: string;
  /** Render the −/+ buttons. Defaults to true. */
  showButtons?: boolean;
  /** Width override. */
  width?: number | string;
  /** Disable input. */
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function NumberUnit({
  value,
  onChange,
  units = ALL_UNITS,
  defaultUnit,
  step = 1,
  min,
  max,
  placeholder = "—",
  showButtons = true,
  width,
  disabled = false,
  className,
  style,
}: NumberUnitProps) {
  const [unitOpen, setUnitOpen] = useState(false);
  const unitBtnRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Track input as a string so users can clear / mid-type without weird re-renders.
  const [draft, setDraft] = useState<string>(
    value ? String(value.value) : "",
  );
  useEffect(() => {
    setDraft(value ? String(value.value) : "");
  }, [value]);

  const activeUnit: LengthUnit =
    value?.unit ?? defaultUnit ?? units[0] ?? "px";

  function clamp(n: number) {
    if (typeof min === "number" && n < min) return min;
    if (typeof max === "number" && n > max) return max;
    return n;
  }

  function commit(nextValue: number | null) {
    if (nextValue === null) {
      onChange(null);
      return;
    }
    onChange({ value: clamp(nextValue), unit: activeUnit });
  }

  function setUnit(unit: LengthUnit) {
    setUnitOpen(false);
    if (value) {
      onChange({ value: value.value, unit });
    } else {
      // Caller hadn't set a value yet; just remember the unit for next entry.
      // Do nothing — they'll commit a number first.
    }
  }

  // Close popover on outside click / escape.
  useEffect(() => {
    if (!unitOpen) return;
    function onDoc(e: MouseEvent) {
      if (
        popoverRef.current?.contains(e.target as Node) ||
        unitBtnRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setUnitOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setUnitOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [unitOpen]);

  const numericValue = value?.value ?? Number(draft);
  const isNumeric = Number.isFinite(numericValue);

  return (
    <div
      className={`relative inline-flex items-stretch overflow-visible ${className ?? ""}`}
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
          disabled={
            disabled || (isNumeric && typeof min === "number" && numericValue <= min)
          }
          onClick={() => {
            if (!isNumeric) return;
            commit(numericValue - step);
          }}
          className="inline-flex w-6 cursor-pointer items-center justify-center"
          style={{
            background: "transparent",
            border: "none",
            color: CHROME.muted,
            fontSize: 13,
          }}
        >
          −
        </button>
      ) : null}
      <input
        type="text"
        inputMode="decimal"
        value={value ? String(value.value) : draft}
        placeholder={value ? undefined : placeholder}
        disabled={disabled}
        onChange={(e) => {
          const raw = e.target.value.trim();
          setDraft(raw);
          if (raw === "") {
            commit(null);
            return;
          }
          const n = Number(raw);
          if (Number.isFinite(n)) {
            commit(n);
          }
        }}
        onBlur={() => {
          // If user typed garbage, snap back.
          if (draft === "" || !Number.isFinite(Number(draft))) {
            commit(null);
          }
        }}
        className="min-w-[44px] flex-1 text-center"
        style={{
          background: "transparent",
          border: "none",
          outline: "none",
          fontFamily: "inherit",
          fontSize: 12.5,
          color: value ? CHROME.ink : CHROME.muted2,
          fontVariantNumeric: "tabular-nums",
          padding: 0,
        }}
      />
      {showButtons ? (
        <button
          type="button"
          aria-label="Increment"
          tabIndex={-1}
          disabled={
            disabled || (isNumeric && typeof max === "number" && numericValue >= max)
          }
          onClick={() => {
            if (!isNumeric) {
              commit(0);
              return;
            }
            commit(numericValue + step);
          }}
          className="inline-flex w-6 cursor-pointer items-center justify-center"
          style={{
            background: "transparent",
            border: "none",
            color: CHROME.muted,
            fontSize: 13,
          }}
        >
          +
        </button>
      ) : null}
      <button
        ref={unitBtnRef}
        type="button"
        title="Change unit"
        aria-label={`Unit: ${activeUnit}. Click to change.`}
        aria-haspopup="listbox"
        aria-expanded={unitOpen}
        disabled={disabled || units.length <= 1}
        onClick={() => setUnitOpen((v) => !v)}
        className="inline-flex shrink-0 cursor-pointer items-center justify-center px-2 uppercase"
        style={{
          background: "transparent",
          border: "none",
          borderLeft: `1px solid ${CHROME.line}`,
          color: CHROME.muted2,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.04em",
          minWidth: 32,
        }}
      >
        {activeUnit}
      </button>
      {unitOpen ? (
        <div
          ref={popoverRef}
          role="listbox"
          aria-label="Unit"
          className="absolute z-[10000]"
          style={{
            top: "calc(100% + 4px)",
            right: 0,
            background: CHROME.paper2,
            border: `1px solid ${CHROME.lineMid}`,
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            padding: 4,
            minWidth: 64,
            display: "flex",
            flexDirection: "column",
            gap: 1,
          }}
        >
          {units.map((u) => (
            <button
              key={u}
              role="option"
              aria-selected={u === activeUnit}
              type="button"
              onClick={() => setUnit(u)}
              className="cursor-pointer text-left uppercase"
              style={{
                background: u === activeUnit ? CHROME.surface2 : "transparent",
                border: "none",
                borderRadius: 4,
                padding: "5px 8px",
                fontSize: 11,
                fontWeight: 600,
                color: u === activeUnit ? CHROME.ink : CHROME.muted,
                letterSpacing: "0.04em",
              }}
              onMouseEnter={(e) => {
                if (u !== activeUnit)
                  e.currentTarget.style.background = CHROME.surface2;
              }}
              onMouseLeave={(e) => {
                if (u !== activeUnit)
                  e.currentTarget.style.background = "transparent";
              }}
            >
              {u}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Format a LengthValue as a CSS string. `null` → empty (caller decides fallback).
 */
export function formatLength(v: LengthValue | null | undefined): string {
  if (!v) return "";
  return `${v.value}${v.unit}`;
}
