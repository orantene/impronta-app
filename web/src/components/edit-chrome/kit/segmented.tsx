"use client";

/**
 * Segmented — pill-style radio group used everywhere a choice is small
 * and visually compact (alignment, container width, font weight, etc).
 *
 * Same visual language as DrawerTabs: paper-tinted track, white pill on
 * active, soft shadow under the pill. The difference is API:
 *   - DrawerTabs is composed (you put DrawerTab children in)
 *   - Segmented takes options + value + onChange (typed enum picker)
 *
 * Use Segmented when the choice is content-y (a property value); use
 * DrawerTabs when it's navigational (switching panels).
 */

import type { CSSProperties, ReactNode } from "react";

import { CHROME } from "./tokens";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Optional small icon to the left of the label. */
  icon?: ReactNode;
}

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (next: T) => void;
  options: ReadonlyArray<SegmentedOption<T>>;
  /** Stretch to fill width with equal-width segments. */
  fullWidth?: boolean;
  /** When true, no minimum width is enforced — chips size to content. */
  compact?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  fullWidth = false,
  compact = false,
  className,
  style,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      className={`inline-flex p-[3px] ${className ?? ""}`}
      style={{
        background: CHROME.paper,
        border: `1px solid ${CHROME.controlBorder}`,
        borderRadius: 7,
        display: fullWidth ? "grid" : "inline-flex",
        // QA 2026-05-13 — Page background field has 11 chips; the old
        // `minmax(0, 1fr)` grid forced them all into one row and clipped
        // labels mid-word ("NoirChampagneNoise"). `auto-fit` + a 76px
        // minimum lets the grid wrap to multiple rows on narrow inspector
        // panels while still distributing space evenly when the row has
        // room. Existing call sites with ≤4 options are unaffected — they
        // still fit one row at any inspector width.
        gridTemplateColumns: fullWidth
          ? `repeat(auto-fit, minmax(76px, 1fr))`
          : undefined,
        gap: fullWidth ? 2 : undefined,
        ...style,
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            title={typeof opt.label === "string" ? opt.label : undefined}
            className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md transition-all"
            style={{
              // `min-width: 0` lets the button shrink below its content's
              // natural width inside a grid cell; combined with the
              // truncating inner span this prevents long labels (e.g.
              // "Noise (animated)") from blowing out the row.
              minWidth: 0,
              padding: compact ? "5px 9px" : "5px 11px",
              fontSize: 11.5,
              fontWeight: 600,
              letterSpacing: "-0.005em",
              background: active ? CHROME.surface : "transparent",
              // Inactive options use stone-600 (warm, ~7:1) rather than the
              // lighter `muted` so every choice stays clearly legible — the
              // white active pill + shadow remains the "selected" signal.
              color: active ? CHROME.ink : "#57534e",
              border: "none",
              boxShadow: active
                ? "0 1px 3px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)"
                : "none",
            }}
          >
            {opt.icon ? <span aria-hidden>{opt.icon}</span> : null}
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                minWidth: 0,
              }}
            >
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
