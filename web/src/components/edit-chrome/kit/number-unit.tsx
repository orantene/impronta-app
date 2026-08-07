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

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

import { useEditorLocale } from "../use-editor-locale";
import { CHROME, CHROME_SHADOWS } from "./tokens";
import { PortaledOverlay } from "./portaled-overlay";
import { useAnchoredPopover } from "./use-anchored-popover";

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

export interface NumberUnitProps {
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
  // WAVE 4.4 — the placeholder is the only operator-readable copy this control
  // owns ("Auto", "Inherit", "e.g. 1.03"); translate it at the boundary.
  const { t } = useEditorLocale();
  const [unitOpen, setUnitOpen] = useState(false);
  // Portaled to <body> via PortaledOverlay so the unit list isn't clipped by the
  // inspector dock's overflow scroll container. Positioning + outside-click /
  // Escape dismissal come from the shared hook (refs kept under the old names).
  const {
    triggerRef: unitBtnRef,
    popoverRef,
    position: unitMenuPos,
  } = useAnchoredPopover<HTMLButtonElement, HTMLDivElement>({
    open: unitOpen,
    onClose: () => setUnitOpen(false),
    width: 72,
    align: "right",
  });

  // Track input as a string so users can clear / mid-type without weird re-renders.
  const [draft, setDraft] = useState<string>(
    value ? String(value.value) : "",
  );
  useEffect(() => {
    setDraft(value ? String(value.value) : "");
  }, [value]);

  // ── Drag-to-scrub (INS-3) ────────────────────────────────────────────────
  // Pointer-lock-based horizontal scrubbing on the input itself.
  // Hold and drag left/right to adjust the number. Modifier keys change step:
  //   default → step; Shift → step×10; Alt/Option → step÷10 (snapped to 1dp).
  const scrubRef = useRef<{
    startX: number;
    startValue: number;
    accumulated: number;
  } | null>(null);
  const isScrubbing = useRef(false);

  const onScrubPointerDown = useCallback(
    (e: React.PointerEvent<HTMLInputElement>) => {
      if (disabled) return;
      // Only initiate scrub on plain left-click-drag (no text selection intent).
      if (e.button !== 0) return;
      const currentValue = value?.value ?? (Number(draft) || 0);
      if (!Number.isFinite(currentValue)) return;
      scrubRef.current = { startX: e.clientX, startValue: currentValue, accumulated: 0 };
      isScrubbing.current = false;

      const el = e.currentTarget;

      function onPointerMove(ev: PointerEvent) {
        if (!scrubRef.current) return;
        const dx = ev.clientX - scrubRef.current.startX;
        // Only enter scrub mode after 4px of movement to preserve normal click-to-focus.
        if (!isScrubbing.current && Math.abs(dx) < 4) return;
        if (!isScrubbing.current) {
          isScrubbing.current = true;
          el.setPointerCapture(ev.pointerId);
          el.style.cursor = "ew-resize";
        }
        const effectiveStep = ev.shiftKey ? step * 10 : ev.altKey ? step / 10 : step;
        const rawNext = scrubRef.current.startValue + dx * effectiveStep;
        let snapped = Math.round(rawNext / effectiveStep) * effectiveStep;
        if (typeof min === "number" && snapped < min) snapped = min;
        if (typeof max === "number" && snapped > max) snapped = max;
        // Round to avoid floating-point noise from Alt÷10 step.
        snapped = Math.round(snapped * 100) / 100;
        onChange({ value: snapped, unit: value?.unit ?? defaultUnit ?? units[0] ?? "px" });
      }

      function onPointerUp(ev: PointerEvent) {
        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerup", onPointerUp);
        if (isScrubbing.current) {
          el.releasePointerCapture(ev.pointerId);
          el.style.cursor = "";
          // Brief timeout so the click event (which fires after pointerup) doesn't
          // select all text and interrupt the new value.
          window.setTimeout(() => {
            isScrubbing.current = false;
          }, 0);
        }
        scrubRef.current = null;
      }

      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);
    },
    [disabled, draft, value, step, min, max, onChange, defaultUnit, units],
  );

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

  // Outside-click / Escape dismissal is handled by useAnchoredPopover above.

  const numericValue = value?.value ?? Number(draft);
  const isNumeric = Number.isFinite(numericValue);

  return (
    <div
      className={`relative inline-flex items-stretch overflow-visible ${className ?? ""}`}
      style={{
        height: 30,
        background: CHROME.controlFill,
        border: `1px solid ${CHROME.controlBorder}`,
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
        e.currentTarget.style.borderColor = CHROME.controlBorder;
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
        placeholder={value ? undefined : t(placeholder)}
        disabled={disabled}
        onPointerDown={onScrubPointerDown}
        onClick={(e) => {
          // If scrub just finished, don't select-all — the scrub already committed
          // a new value and selecting would feel jarring.
          if (isScrubbing.current) {
            e.preventDefault();
          }
        }}
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
        title="Drag to scrub, or click to type"
        style={{
          background: "transparent",
          border: "none",
          outline: "none",
          fontFamily: "inherit",
          fontSize: 12.5,
          color: value ? CHROME.ink : CHROME.muted,
          fontVariantNumeric: "tabular-nums",
          padding: 0,
          cursor: disabled ? "default" : "ew-resize",
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
          borderLeft: `1px solid ${CHROME.controlBorder}`,
          color: CHROME.muted,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.04em",
          minWidth: 32,
        }}
      >
        {activeUnit}
      </button>
      {unitOpen ? (
        <PortaledOverlay>
        <div
          ref={popoverRef}
          role="listbox"
          aria-label="Unit"
          data-edit-overlay="number-unit-listbox"
          style={{
            position: "fixed",
            top: unitMenuPos?.top ?? -9999,
            left: unitMenuPos?.left ?? -9999,
            opacity: unitMenuPos ? 1 : 0,
            zIndex: 200,
            background: CHROME.paper2,
            border: `1px solid ${CHROME.lineMid}`,
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            padding: 4,
            minWidth: 72,
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
        </PortaledOverlay>
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
