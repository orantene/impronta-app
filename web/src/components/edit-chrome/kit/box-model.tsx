"use client";

/**
 * BoxModel — visual CSS box-model diagram.
 *
 * Renders a margin-outside / padding-inside diagram with 4 labeled inset
 * inputs per layer (top / right / bottom / left). Each layer can show a
 * link icon to toggle "all-sides linked" mode for that layer independently.
 *
 * Visual layout:
 *
 *   ┌─────────────── MARGIN ────────────────┐
 *   │                  [T]                  │
 *   │  [L]  ┌──────── PADDING ──────────┐  [R]  │
 *   │       │             [T]           │       │
 *   │       │  [L]  ┌──CONTENT──┐  [R]  │       │
 *   │       │       └───────────┘       │       │
 *   │       │             [B]           │       │
 *   │       └──────────────────────────┘       │
 *   │                  [B]                  │
 *   └───────────────────────────────────────┘
 *
 * The four inputs per layer are NumberUnit controls (px only). Clicking the
 * link icon in the center of each layer toggles "link sides" — when linked,
 * editing any value calls onChangeLinked so the parent can patch a single
 * linked field (e.g. marginInlinePx + marginBlockPx) or "all" (e.g.
 * paddingInlinePx + paddingTopPx).
 *
 * This is a PURE UI component — it emits values through callbacks; the
 * parent owns the actual state.
 */

import { useState, type ReactNode } from "react";

import { CHROME } from "./tokens";
import { NumberUnit, type LengthValue } from "./number-unit";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BoxSides {
  top?: number | null;
  right?: number | null;
  bottom?: number | null;
  left?: number | null;
}

export interface BoxModelValue {
  margin: BoxSides;
  padding: BoxSides;
}

interface BoxModelProps {
  margin: BoxSides;
  padding: BoxSides;
  onChangeMargin: (side: "top" | "right" | "bottom" | "left", value: number | null) => void;
  onChangePadding: (side: "top" | "right" | "bottom" | "left", value: number | null) => void;
  /** Max px value for margin inputs. Defaults to 240. */
  maxMargin?: number;
  /** Max px value for padding inputs. Defaults to 160. */
  maxPadding?: number;
  disabled?: boolean;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function toPx(v: number | null | undefined): LengthValue | null {
  return typeof v === "number" && Number.isFinite(v) ? { value: v, unit: "px" } : null;
}

function fromPx(v: LengthValue | null): number | null {
  return v ? Math.round(v.value) : null;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

interface SideInputProps {
  label: string;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  max: number;
  disabled?: boolean;
  /** Horizontal (left/right) or vertical (top/bottom) sizing */
  axis: "h" | "v";
}

function SideInput({ label, value, onChange, max, disabled, axis }: SideInputProps) {
  return (
    <div
      className="flex flex-col items-center gap-0.5"
      style={{ minWidth: axis === "h" ? 50 : 46 }}
    >
      <span
        style={{
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: CHROME.muted2,
        }}
      >
        {label}
      </span>
      <NumberUnit
        units={["px"]}
        defaultUnit="px"
        min={0}
        max={max}
        placeholder="—"
        showButtons={false}
        value={toPx(value)}
        onChange={(next) => onChange(fromPx(next))}
        disabled={disabled}
        style={{ width: axis === "h" ? 50 : 46 }}
      />
    </div>
  );
}

// ─── Link icon (chain link toggle) ───────────────────────────────────────────

function LinkIcon({ linked, onToggle }: { linked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={linked ? "Unlink sides" : "Link sides"}
      aria-label={linked ? "Unlink sides" : "Link sides"}
      className="cursor-pointer"
      style={{
        width: 20,
        height: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 4,
        border: `1px solid ${linked ? CHROME.accent : CHROME.lineMid}`,
        background: linked ? `${CHROME.accent}14` : "transparent",
        color: linked ? CHROME.accent : CHROME.muted2,
        flexShrink: 0,
      }}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
        {linked ? (
          // Two connected links
          <>
            <path d="M2 5h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M6 5h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M3 3.5 A1.8 1.8 0 0 0 3 6.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            <path d="M7 6.5 A1.8 1.8 0 0 0 7 3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          </>
        ) : (
          // Broken link
          <>
            <path d="M2 5h1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M6.5 5H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M3.5 4 A1.8 1.8 0 0 0 3 6" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeDasharray="1.5 1" />
            <path d="M7 4 A1.8 1.8 0 0 0 6.5 6" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeDasharray="1.5 1" />
          </>
        )}
      </svg>
    </button>
  );
}

// ─── Layer band ───────────────────────────────────────────────────────────────

/** A single margin or padding band: shows T/R/B/L inputs around a center label. */
interface LayerBandProps {
  label: string;
  sides: BoxSides;
  onChangeSide: (side: "top" | "right" | "bottom" | "left", value: number | null) => void;
  max: number;
  color: string;
  linked: boolean;
  onToggleLink: () => void;
  disabled?: boolean;
  children?: ReactNode;
}

function LayerBand({
  label,
  sides,
  onChangeSide,
  max,
  color,
  linked,
  onToggleLink,
  disabled,
  children,
}: LayerBandProps) {
  // When linked, all four sides should show the same value (top value).
  const linkedValue = linked ? sides.top ?? null : undefined;

  function handleChange(side: "top" | "right" | "bottom" | "left", v: number | null) {
    if (linked) {
      // Broadcast the same value to all four sides.
      onChangeSide("top", v);
      onChangeSide("right", v);
      onChangeSide("bottom", v);
      onChangeSide("left", v);
    } else {
      onChangeSide(side, v);
    }
  }

  return (
    <div
      style={{
        border: `1.5px solid ${color}`,
        borderRadius: 7,
        padding: "6px",
        position: "relative",
        background: `${color}08`,
      }}
    >
      {/* Layer label */}
      <div
        style={{
          position: "absolute",
          top: -8,
          left: 8,
          background: CHROME.paper2 || "#fff",
          padding: "0 4px",
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color,
        }}
      >
        {label}
      </div>

      {/* Top input */}
      <div className="flex justify-center mb-1">
        <SideInput
          label="T"
          value={linked ? linkedValue : sides.top}
          onChange={(v) => handleChange("top", v)}
          max={max}
          disabled={disabled}
          axis="v"
        />
      </div>

      {/* Middle row: left | link toggle + inner content | right */}
      <div className="flex items-center gap-1">
        <SideInput
          label="L"
          value={linked ? linkedValue : sides.left}
          onChange={(v) => handleChange("left", v)}
          max={max}
          disabled={disabled}
          axis="h"
        />
        {/* Inner content placeholder or nested layer */}
        <div className="flex flex-1 items-center justify-center gap-1.5 py-1">
          <LinkIcon linked={linked} onToggle={onToggleLink} />
          {children ? (
            <div className="flex-1">{children}</div>
          ) : (
            <div
              style={{
                flex: 1,
                minHeight: 20,
                background: `${color}12`,
                borderRadius: 4,
                border: `1px dashed ${color}40`,
              }}
            />
          )}
        </div>
        <SideInput
          label="R"
          value={linked ? linkedValue : sides.right}
          onChange={(v) => handleChange("right", v)}
          max={max}
          disabled={disabled}
          axis="h"
        />
      </div>

      {/* Bottom input */}
      <div className="flex justify-center mt-1">
        <SideInput
          label="B"
          value={linked ? linkedValue : sides.bottom}
          onChange={(v) => handleChange("bottom", v)}
          max={max}
          disabled={disabled}
          axis="v"
        />
      </div>
    </div>
  );
}

// ─── Main BoxModel diagram ────────────────────────────────────────────────────

export function BoxModel({
  margin,
  padding,
  onChangeMargin,
  onChangePadding,
  maxMargin = 240,
  maxPadding = 160,
  disabled,
}: BoxModelProps) {
  const [marginLinked, setMarginLinked] = useState(false);
  const [paddingLinked, setPaddingLinked] = useState(false);

  return (
    <div style={{ fontSize: 12 }}>
      <LayerBand
        label="Margin"
        sides={margin}
        onChangeSide={onChangeMargin}
        max={maxMargin}
        color="#6b7f9e"
        linked={marginLinked}
        onToggleLink={() => setMarginLinked((v) => !v)}
        disabled={disabled}
      >
        <LayerBand
          label="Padding"
          sides={padding}
          onChangeSide={onChangePadding}
          max={maxPadding}
          color="#3b8c6e"
          linked={paddingLinked}
          onToggleLink={() => setPaddingLinked((v) => !v)}
          disabled={disabled}
        />
      </LayerBand>
    </div>
  );
}
