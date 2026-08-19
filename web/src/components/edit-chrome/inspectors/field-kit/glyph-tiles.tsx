"use client";

/**
 * Inspector FIELD KIT — GlyphTiles. D9 item 3.
 *
 * OWNER, verbatim: "Visual choices render as glyph tiles. Corner radius,
 * border style, border weight context, shadow, divider style: small minimal
 * tiles that SHOW the result, with a caption carrying label + value where
 * numeric."
 *
 * The rule this encodes: if the property has a LOOK, the control shows the
 * look. "Solid / Dash / Dot" as three words is the inspector asking the
 * operator to compile CSS in their head; three 26px lines answer the question
 * before it is asked. Same for corners (the glyph bends by the actual radius)
 * and shadows (the glyph wears the literal box-shadow it is offering).
 *
 * Every glyph is pure CSS or inline SVG — no icon font, no image, no external
 * asset. They are small enough that a tile grid costs nothing to render and
 * cannot fail to load.
 *
 * MINIMAL AND CLEAN, his words. One border, one accent, no fills beyond the
 * selection tint, no drop shadows on the tiles themselves (a tile that casts
 * its own shadow while offering a shadow preset is unreadable).
 *
 * ── ACCESSIBILITY ─────────────────────────────────────────────────────────
 * A real `radiogroup`: roving tabindex, arrow keys in all four directions,
 * `aria-checked`, and an accessible name from the field label. The approach is
 * lifted from `kit/segmented.tsx`, which gets it right, with one fix — when
 * nothing is selected, Segmented leaves the group with no tab stop at all and
 * it becomes keyboard-unreachable. Here the first tile takes the stop.
 *
 * The glyph itself is `aria-hidden`; the accessible name is the caption text,
 * because a screen-reader user needs "Dashed" and not "a picture of a line".
 */

import { useId, useRef, type CSSProperties, type ReactNode } from "react";

import { useInspectorT } from "../kit/use-inspector-t";
import { FieldRow } from "./field-row";
import { presetCaption, type PresetTable, type PresetValue } from "./preset-values";
import { FIELD_KIT } from "./tokens";

// ═══ Glyphs ═════════════════════════════════════════════════════════════════

const GLYPH = FIELD_KIT.size.glyph;

/**
 * A corner bent by the ACTUAL radius. Two strokes meeting at a rounded elbow,
 * drawn as one open path so the tile reads as "a corner", not "a box".
 *
 * `radiusPx` is the real resolved value; the glyph clamps it to the drawable
 * range so `pill` (999px) renders as the fullest possible bend rather than
 * silently degenerating.
 */
export function CornerRadiusGlyph({
  radiusPx,
  color,
}: {
  radiusPx: number;
  color: string;
}) {
  const box = GLYPH;
  const inset = 3;
  const span = box - inset * 2;
  const r = Math.max(0, Math.min(radiusPx, span));
  return (
    <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`} aria-hidden focusable="false">
      <path
        d={`M ${inset} ${box - inset} L ${inset} ${inset + r} A ${r} ${r} 0 0 1 ${inset + r} ${inset} L ${box - inset} ${inset}`}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** A horizontal rule in the offered stroke style. `"none"` shows an empty slot. */
export function LineStyleGlyph({
  lineStyle,
  color,
  weightPx = 1.5,
}: {
  lineStyle: "none" | "solid" | "dashed" | "dotted";
  color: string;
  weightPx?: number;
}) {
  if (lineStyle === "none") {
    return (
      <svg width={GLYPH} height={GLYPH} viewBox={`0 0 ${GLYPH} ${GLYPH}`} aria-hidden focusable="false">
        {/* An explicitly empty slot, not a blank tile — the absence is the value. */}
        <line
          x1={4}
          y1={GLYPH - 4}
          x2={GLYPH - 4}
          y2={4}
          stroke={color}
          strokeWidth={1}
          opacity={0.35}
        />
      </svg>
    );
  }
  const dash =
    lineStyle === "dashed" ? "4 3" : lineStyle === "dotted" ? `0.1 ${weightPx * 2.2}` : undefined;
  return (
    <svg width={GLYPH} height={GLYPH} viewBox={`0 0 ${GLYPH} ${GLYPH}`} aria-hidden focusable="false">
      <line
        x1={3}
        y1={GLYPH / 2}
        x2={GLYPH - 3}
        y2={GLYPH / 2}
        stroke={color}
        strokeWidth={weightPx}
        strokeDasharray={dash}
        strokeLinecap={lineStyle === "dotted" ? "round" : "butt"}
      />
    </svg>
  );
}

/**
 * A small card wearing the LITERAL shadow being offered. Not a stylised
 * "shadow icon" — the actual CSS value, so S / M / L stop being a guess.
 */
export function ShadowGlyph({ shadow }: { shadow: string }) {
  return (
    <span
      aria-hidden
      style={{
        display: "block",
        width: GLYPH - 4,
        height: GLYPH - 8,
        margin: "4px 2px",
        borderRadius: FIELD_KIT.radius.chip,
        background: FIELD_KIT.surface,
        border: `1px solid ${FIELD_KIT.border}`,
        boxShadow: shadow === "none" || shadow === "" ? "none" : shadow,
      }}
    />
  );
}

/** A divider rule with its weight and style, for divider-style fields. */
export function DividerGlyph({
  lineStyle,
  weightPx,
  color,
}: {
  lineStyle: "none" | "solid" | "dashed" | "dotted";
  weightPx: number;
  color: string;
}) {
  return <LineStyleGlyph lineStyle={lineStyle} color={color} weightPx={weightPx} />;
}

/**
 * Border WEIGHT in context: a rule of the given thickness, so 1px and 4px are
 * distinguishable at a glance instead of by reading two numbers.
 */
export function BorderWeightGlyph({
  weightPx,
  color,
}: {
  weightPx: number;
  color: string;
}) {
  return <LineStyleGlyph lineStyle="solid" color={color} weightPx={Math.max(0.5, weightPx)} />;
}

// ═══ Tile group ═════════════════════════════════════════════════════════════

export interface GlyphTileOption {
  /** The value written to the node style. */
  id: string;
  /** Caption label. A plain string translates at the kit boundary. */
  label: string;
  /**
   * The glyph. Receives the ink color so a selected tile's glyph picks up the
   * accent without every caller wiring it.
   */
  glyph: (ink: string) => ReactNode;
  /** Value shown after the label, when the choice is numeric. */
  valueCaption?: string | null;
}

export interface GlyphTilesProps {
  label: ReactNode;
  options: ReadonlyArray<GlyphTileOption>;
  value: string;
  onChange: (next: string) => void;
  /** Tiles per row. Defaults to 4, which fits a ~300px inspector column. */
  columns?: number;
  /**
   * D9 item 2, for a tile row whose choice is NUMERIC (corner radius, border
   * weight): the exact input sits BESIDE the tiles, exactly as it does on
   * `PresetNumberRow`. The approved mockup draws this as `.tiles` + `.num` in
   * one `.row`, and the rule is not "presets get an exact field" but "a preset
   * is never a ceiling" — which does not stop applying because the control
   * happens to be drawn with pictures.
   *
   * Omit it for a tile row with nothing to type (border style, shadow).
   */
  exact?: ReactNode;
  accessory?: ReactNode;
  hint?: ReactNode;
  /** Forwarded to FieldRow: "tip" (default) hangs the hint off an ⓘ; "inline" keeps it standing. */
  hintPlacement?: "tip" | "inline";
  searchTerms?: string | string[];
  disabled?: boolean;
  dataControl?: string;
  style?: CSSProperties;
}

export function GlyphTiles({
  label,
  options,
  value,
  onChange,
  columns = 4,
  exact,
  accessory,
  hint,
  hintPlacement,
  searchTerms,
  disabled = false,
  dataControl,
  style,
}: GlyphTilesProps) {
  const { t } = useInspectorT();
  const labelId = useId();
  const groupRef = useRef<HTMLDivElement | null>(null);

  const selectedIndex = options.findIndex((o) => o.id === value);
  const tabStopIndex = selectedIndex >= 0 ? selectedIndex : 0;

  function move(from: number, delta: number) {
    const next = (from + delta + options.length) % options.length;
    onChange(options[next].id);
    groupRef.current
      ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
      ?.[next]?.focus();
  }

  return (
    <FieldRow
      label={label}
      accessory={accessory}
      hint={hint}
      hintPlacement={hintPlacement}
      searchTerms={searchTerms}
      orientation="stacked"
      disabled={disabled}
      groupLabelId={labelId}
      dataControl={dataControl}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: FIELD_KIT.gap.control,
          minWidth: 0,
        }}
      >
      <div
        ref={groupRef}
        role="radiogroup"
        aria-labelledby={labelId}
        data-field-kit-tiles=""
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gap: FIELD_KIT.gap.tight,
          flex: "1 1 auto",
          minWidth: 0,
          ...style,
        }}
      >
        {options.map((option, index) => {
          const selected = option.id === value;
          const ink = selected ? FIELD_KIT.accent : FIELD_KIT.ink;
          return (
            <button
              key={option.id || "__default"}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={index === tabStopIndex ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(option.id)}
              onKeyDown={(e) => {
                // Grid navigation: left/right step one, up/down step a row.
                const delta =
                  e.key === "ArrowRight"
                    ? 1
                    : e.key === "ArrowLeft"
                      ? -1
                      : e.key === "ArrowDown"
                        ? columns
                        : e.key === "ArrowUp"
                          ? -columns
                          : 0;
                if (delta === 0) return;
                e.preventDefault();
                move(index, delta);
              }}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 3,
                padding: "6px 4px",
                minWidth: 0,
                borderRadius: FIELD_KIT.radius.tile,
                border: `1px solid ${selected ? FIELD_KIT.accent : FIELD_KIT.border}`,
                background: selected ? FIELD_KIT.accentFill : FIELD_KIT.surface,
                cursor: disabled ? "default" : "pointer",
                transition: `border-color ${FIELD_KIT.motion.duration}ms ${FIELD_KIT.motion.easing}, background-color ${FIELD_KIT.motion.duration}ms ${FIELD_KIT.motion.easing}`,
              }}
            >
              <span
                aria-hidden
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: GLYPH,
                }}
              >
                {option.glyph(ink)}
              </span>
              {/* Caption carries label + value, per D9. */}
              <span
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 3,
                  minWidth: 0,
                  fontSize: FIELD_KIT.font.caption,
                  fontWeight: FIELD_KIT.weight.caption,
                  lineHeight: 1.1,
                  color: selected ? FIELD_KIT.accent : FIELD_KIT.muted,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                  {t(option.label)}
                </span>
                {option.valueCaption ? (
                  <span style={{ fontVariantNumeric: "tabular-nums", opacity: 0.75 }}>
                    {option.valueCaption}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
        {exact ? (
          <div
            data-field-kit-tiles-exact=""
            role="group"
            aria-label={t("Exact value")}
            style={{ flex: "0 0 auto" }}
          >
            {exact}
          </div>
        ) : null}
      </div>
    </FieldRow>
  );
}

// ═══ Ready-made option builders ═════════════════════════════════════════════
//
// P2 should not be hand-assembling glyphs per section — that is how 20 patterns
// happened. These turn a `preset-values` table straight into tiles.

/** Corner-radius tiles whose glyphs bend by the real resolved radius. */
export function radiusTileOptions(presets: PresetTable): GlyphTileOption[] {
  return presets.map((preset) => ({
    id: preset.id,
    label: preset.label,
    valueCaption: presetCaption(preset),
    glyph: (ink: string) => (
      <CornerRadiusGlyph radiusPx={radiusOf(preset)} color={ink} />
    ),
  }));
}

function radiusOf(preset: PresetValue): number {
  if (preset.kind === "unset") return 0;
  if (preset.id === "pill") return 999;
  return preset.numeric?.value ?? 0;
}

/** Border/divider style tiles: none, solid, dashed, dotted. */
export function lineStyleTileOptions(
  presets: PresetTable,
  weightPx = 1.5,
): GlyphTileOption[] {
  return presets.map((preset) => ({
    id: preset.id,
    label: preset.label,
    valueCaption: null,
    glyph: (ink: string) => (
      <LineStyleGlyph lineStyle={lineStyleOf(preset)} color={ink} weightPx={weightPx} />
    ),
  }));
}

function lineStyleOf(preset: PresetValue): "none" | "solid" | "dashed" | "dotted" {
  switch (preset.css) {
    case "solid":
      return "solid";
    case "dashed":
      return "dashed";
    case "dotted":
      return "dotted";
    default:
      return "none";
  }
}

/**
 * Border-WEIGHT tiles: each glyph is a rule of the weight it offers, so 1px
 * and 4px are told apart by looking rather than by reading two numbers.
 */
export function borderWeightTileOptions(presets: PresetTable): GlyphTileOption[] {
  return presets.map((preset) => ({
    id: preset.id,
    label: preset.label,
    valueCaption: null,
    glyph: (ink: string) => (
      <BorderWeightGlyph weightPx={preset.numeric?.value ?? 0} color={ink} />
    ),
  }));
}

/** Shadow tiles that render the literal shadow they offer. */
export function shadowTileOptions(presets: PresetTable): GlyphTileOption[] {
  return presets.map((preset) => ({
    id: preset.id,
    label: preset.label,
    valueCaption: null,
    glyph: () => <ShadowGlyph shadow={preset.css} />,
  }));
}
