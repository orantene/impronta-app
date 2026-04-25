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
        border: `1px solid ${CHROME.line}`,
        borderRadius: 7,
        display: fullWidth ? "grid" : "inline-flex",
        gridTemplateColumns: fullWidth
          ? `repeat(${options.length}, minmax(0, 1fr))`
          : undefined,
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
            className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md transition-all"
            style={{
              padding: compact ? "5px 9px" : "5px 11px",
              fontSize: 11.5,
              fontWeight: 600,
              letterSpacing: "-0.005em",
              background: active ? CHROME.surface : "transparent",
              color: active ? CHROME.ink : CHROME.muted,
              border: "none",
              boxShadow: active
                ? "0 1px 3px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)"
                : "none",
            }}
          >
            {opt.icon ? <span aria-hidden>{opt.icon}</span> : null}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
