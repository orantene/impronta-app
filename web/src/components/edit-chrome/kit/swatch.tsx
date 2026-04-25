"use client";

/**
 * Swatch — color swatch + hex input row.
 *
 * Two flavours:
 *   - <Swatch>          a 30×30 round swatch alone (used in chip rows
 *                        and segmented previews)
 *   - <ColorRow>        full row: swatch + hex text field (+ optional
 *                        opacity stepper) — used in inspector Style tab
 *
 * Matches mockup `.color-swatch` and `.color-row`. The swatch surface
 * carries an inset top highlight so it reads as physical, not flat.
 */

import type { CSSProperties, ReactNode } from "react";

import { CHROME, CHROME_SHADOWS } from "./tokens";

interface SwatchProps {
  color: string;
  /** Mark the swatch as selected (ring + outer pad). */
  active?: boolean;
  /** Decorative only — disables the click handler. */
  decorative?: boolean;
  onClick?: () => void;
  size?: number;
  title?: string;
  className?: string;
  style?: CSSProperties;
}

export function Swatch({
  color,
  active = false,
  decorative = false,
  onClick,
  size = 22,
  title,
  className,
  style,
}: SwatchProps) {
  const Tag = decorative ? "span" : "button";
  return (
    <Tag
      type={decorative ? undefined : "button"}
      onClick={decorative ? undefined : onClick}
      title={title}
      className={`inline-block ${decorative ? "" : "cursor-pointer transition-transform hover:scale-110"} ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        border: active
          ? `2px solid ${CHROME.ink}`
          : `2px solid ${CHROME.line}`,
        boxShadow: active
          ? `0 0 0 2px ${CHROME.paper2}, 0 0 0 3px ${CHROME.ink}`
          : CHROME_SHADOWS.inputInset,
        transform: active ? "scale(1.10)" : undefined,
        padding: 0,
        ...style,
      }}
    />
  );
}

interface ColorRowProps {
  /** Hex / rgb / rgba string. */
  value: string;
  onChange: (next: string) => void;
  /** Show + bind an opacity slider beside the swatch. */
  opacity?: number;
  onOpacityChange?: (next: number) => void;
  /** Label for the swatch tile (e.g. "Used 24×"). */
  trailing?: ReactNode;
}

export function ColorRow({
  value,
  onChange,
  opacity,
  onOpacityChange,
  trailing,
}: ColorRowProps) {
  return (
    <div className="flex items-center gap-2">
      <Swatch color={value} size={30} />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 uppercase"
        style={{
          padding: "6px 9px",
          border: `1px solid ${CHROME.lineMid}`,
          borderRadius: 6,
          background: CHROME.surface2,
          boxShadow: CHROME_SHADOWS.inputInset,
          fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
          fontSize: 12,
          color: CHROME.ink,
          outline: "none",
        }}
        onFocus={(e) => {
          e.target.style.borderColor = CHROME.blue;
          e.target.style.boxShadow = CHROME_SHADOWS.inputFocus;
        }}
        onBlur={(e) => {
          e.target.style.borderColor = CHROME.lineMid;
          e.target.style.boxShadow = CHROME_SHADOWS.inputInset;
        }}
      />
      {typeof opacity === "number" && onOpacityChange ? (
        <div
          className="inline-flex items-center"
          style={{
            width: 80,
            height: 30,
            border: `1px solid ${CHROME.lineMid}`,
            borderRadius: 6,
            background: CHROME.surface2,
            boxShadow: CHROME_SHADOWS.inputInset,
          }}
        >
          <input
            type="text"
            inputMode="numeric"
            value={String(Math.round(opacity))}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) onOpacityChange(Math.max(0, Math.min(100, n)));
            }}
            className="flex-1 text-center"
            style={{
              background: "transparent",
              border: "none",
              outline: "none",
              fontFamily: "inherit",
              fontSize: 12,
              color: CHROME.ink,
              fontVariantNumeric: "tabular-nums",
              padding: 0,
            }}
          />
          <span
            className="pr-2 uppercase"
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: CHROME.muted2,
              letterSpacing: "0.04em",
            }}
          >
            %
          </span>
        </div>
      ) : null}
      {trailing}
    </div>
  );
}
