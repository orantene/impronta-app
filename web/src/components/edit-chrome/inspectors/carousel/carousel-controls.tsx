"use client";

/**
 * carousel-controls.tsx — the slider inspector's field rows.
 *
 * Everything here renders through a field-kit primitive so the slider panel
 * reads as the same product as the rebuilt Style panel: one label column, one
 * border colour, three font sizes, preset chips that carry their real values,
 * and glyph tiles wherever the choice has a LOOK.
 *
 * TWO DELIBERATE ADDITIONS, BOTH EXPLAINED
 * ────────────────────────────────────────
 * 1. `CarouselSwitchRow`. The kit has no boolean primitive; the panels reach
 *    for `kit/toggle.tsx`, which draws its own label at its own size and is
 *    therefore the ragged left edge the reset removed everywhere else. So the
 *    SWITCH is the shipped one (no second switch), and the LABEL comes from
 *    `FieldRow`. Nothing new is drawn.
 *
 * 2. `CarouselPresetStepperRow`. `PresetNumberRow` is the right shape for
 *    "rotate every 5.2s", but its exact input is `NumberUnit`, whose unit type
 *    is `LengthUnit` — px/rem/em/%/vw/vh. Milliseconds are not a CSS length,
 *    and putting `px` next to a duration would be a control lying about what
 *    it holds. This is the same layout (chips carrying real values, exact
 *    input BESIDE them, never behind a disclosure) driving the existing
 *    `Stepper`, which already speaks a free unit. Not a second numeric input:
 *    `Stepper` is what the durations in this panel already used.
 */

import type { ReactNode } from "react";

import { Stepper, Toggle } from "../../kit";
import { FieldRow, FIELD_KIT, type GlyphTileOption } from "../field-kit";
import { useInspectorT } from "../kit/use-inspector-t";
import {
  CAROUSEL_SLIDES_PER_VIEW_CHOICES,
  effectiveSlidesPerView,
  hasSlidesPerViewOverride,
  type CarouselResponsiveTier,
  type CarouselSlidesPerView,
} from "@/lib/site-admin/builder-node/carousel-slides-per-view";

// ── Boolean ─────────────────────────────────────────────────────────────────

export function CarouselSwitchRow({
  label,
  hint,
  searchTerms,
  on,
  onChange,
  disabled,
}: {
  label: string;
  hint?: ReactNode;
  searchTerms?: string[];
  on: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <FieldRow label={label} hint={hint} searchTerms={searchTerms} disabled={disabled}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Toggle on={on} onChange={onChange} disabled={disabled} />
      </div>
    </FieldRow>
  );
}

// ── Duration / number with presets ──────────────────────────────────────────

export interface CarouselNumberPreset {
  /** The stored value this chip writes. */
  readonly value: number;
  /** Short chip label, e.g. "Slow". */
  readonly label: string;
  /** The chip's REAL value, shown under the label. Rule 1 of the kit. */
  readonly caption: string;
}

export function CarouselPresetStepperRow({
  label,
  hint,
  searchTerms,
  presets,
  value,
  onChange,
  min,
  max,
  step,
  unit,
  disabled,
}: {
  label: string;
  hint?: ReactNode;
  searchTerms?: string[];
  presets: readonly CarouselNumberPreset[];
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
  disabled?: boolean;
}) {
  const { t } = useInspectorT();
  const lit = presets.findIndex((p) => p.value === value);
  return (
    <FieldRow
      label={label}
      hint={hint}
      searchTerms={searchTerms}
      orientation="stacked"
      disabled={disabled}
    >
      <div style={{ display: "flex", alignItems: "center", gap: FIELD_KIT.gap.control }}>
        <div
          role="radiogroup"
          aria-label={t(label)}
          style={{ display: "flex", gap: FIELD_KIT.gap.tight, flex: 1, minWidth: 0 }}
        >
          {presets.map((preset, index) => {
            const selected = index === lit;
            return (
              <button
                key={preset.value}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                onClick={() => onChange(preset.value)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: FIELD_KIT.size.presetChip,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 1,
                  padding: "0 4px",
                  borderRadius: FIELD_KIT.radius.chip,
                  border: `1px solid ${selected ? FIELD_KIT.accent : FIELD_KIT.border}`,
                  background: selected ? FIELD_KIT.accentFill : FIELD_KIT.surface,
                  color: selected ? FIELD_KIT.accent : FIELD_KIT.ink,
                  cursor: disabled ? "default" : "pointer",
                }}
              >
                <span
                  style={{
                    fontSize: FIELD_KIT.font.label,
                    fontWeight: FIELD_KIT.weight.label,
                  }}
                >
                  {t(preset.label)}
                </span>
                {/* Rule 1: the chip shows what it resolves to, never just a name. */}
                <span style={{ fontSize: FIELD_KIT.font.caption, color: FIELD_KIT.muted }}>
                  {preset.caption}
                </span>
              </button>
            );
          })}
        </div>
        {/* Rule 2: the exact value sits BESIDE the chips, never behind a
         *  "Custom value" disclosure. */}
        <Stepper
          value={value}
          min={min}
          max={max}
          step={step}
          unit={unit}
          disabled={disabled}
          width={104}
          onChange={(next) => onChange(Number(next))}
        />
      </div>
    </FieldRow>
  );
}

// ── Slides visible, per device ──────────────────────────────────────────────

const DEVICE_TIERS: ReadonlyArray<{
  tier: CarouselResponsiveTier | null;
  label: string;
  glyph: (ink: string) => ReactNode;
}> = [
  { tier: null, label: "Desktop", glyph: (ink) => <DeviceGlyph ink={ink} kind="desktop" /> },
  { tier: "tablet", label: "Tablet", glyph: (ink) => <DeviceGlyph ink={ink} kind="tablet" /> },
  { tier: "mobile", label: "Phone", glyph: (ink) => <DeviceGlyph ink={ink} kind="mobile" /> },
];

/**
 * "Slides visible" for desktop / tablet / phone in one control.
 *
 * WHY ALL THREE AT ONCE, rather than following the panel-wide device rail the
 * Style panel uses: this Content panel has no device rail, and the question an
 * operator actually asks here is comparative ("4 on desktop, how many on a
 * phone?"). Three small rows answer it without a mode switch, and each row
 * shows the INHERITED number when it has no override, so the grid never has a
 * blank cell the operator has to interpret.
 */
export function SlidesPerViewRows({
  props,
  onSet,
  onReset,
}: {
  props: Parameters<typeof effectiveSlidesPerView>[0];
  onSet: (tier: CarouselResponsiveTier | null, next: CarouselSlidesPerView) => void;
  onReset: (tier: CarouselResponsiveTier) => void;
}) {
  const { t } = useInspectorT();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: FIELD_KIT.gap.tight }}>
      {DEVICE_TIERS.map(({ tier, label, glyph }) => {
        const current = effectiveSlidesPerView(props, tier);
        const overridden = tier !== null && hasSlidesPerViewOverride(props, tier);
        return (
          <div
            key={label}
            data-carousel-slides-tier={tier ?? "desktop"}
            style={{ display: "flex", alignItems: "center", gap: FIELD_KIT.gap.control }}
          >
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                width: FIELD_KIT.size.labelColumn,
                flexShrink: 0,
                fontSize: FIELD_KIT.font.label,
                fontWeight: FIELD_KIT.weight.label,
                color: FIELD_KIT.ink,
              }}
            >
              {glyph(FIELD_KIT.muted)}
              {t(label)}
            </span>
            <div
              role="radiogroup"
              aria-label={`${t("Slides visible")} ${t(label)}`}
              style={{ display: "flex", gap: FIELD_KIT.gap.tight, flex: 1, minWidth: 0 }}
            >
              {CAROUSEL_SLIDES_PER_VIEW_CHOICES.map((count) => {
                const selected = count === current;
                return (
                  <button
                    key={count}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onSet(tier, count)}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      height: FIELD_KIT.size.control,
                      borderRadius: FIELD_KIT.radius.chip,
                      border: `1px solid ${selected ? FIELD_KIT.accent : FIELD_KIT.border}`,
                      background: selected ? FIELD_KIT.accentFill : FIELD_KIT.surface,
                      // An inherited number is shown, but shown as inherited:
                      // a lit chip that looks identical to a set one is how an
                      // operator concludes they already made a choice here.
                      color: selected
                        ? overridden || tier === null
                          ? FIELD_KIT.accent
                          : FIELD_KIT.muted
                        : FIELD_KIT.ink,
                      fontSize: FIELD_KIT.font.value,
                      fontWeight: FIELD_KIT.weight.label,
                      cursor: "pointer",
                    }}
                  >
                    {count}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => tier && onReset(tier)}
              disabled={!overridden}
              title={t("Use the desktop value")}
              style={{
                flexShrink: 0,
                width: 46,
                height: FIELD_KIT.size.control,
                border: 0,
                background: "transparent",
                color: overridden ? FIELD_KIT.muted : "transparent",
                fontSize: FIELD_KIT.font.caption,
                fontWeight: FIELD_KIT.weight.label,
                cursor: overridden ? "pointer" : "default",
              }}
            >
              {t("Reset")}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function DeviceGlyph({ ink, kind }: { ink: string; kind: "desktop" | "tablet" | "mobile" }) {
  const box = kind === "desktop" ? { w: 14, h: 10 } : kind === "tablet" ? { w: 10, h: 13 } : { w: 7, h: 13 };
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden focusable="false">
      <rect
        x={(16 - box.w) / 2}
        y={(16 - box.h) / 2}
        width={box.w}
        height={box.h}
        rx={1.5}
        fill="none"
        stroke={ink}
        strokeWidth={1.3}
      />
    </svg>
  );
}

// ── Glyph tile option builders ──────────────────────────────────────────────

/** Rail vs hero, drawn: three columns of cards, or one full-bleed frame. */
export const CAROUSEL_VARIANT_TILES: readonly GlyphTileOption[] = [
  {
    id: "rail",
    label: "Rail",
    glyph: (ink) => (
      <svg width={26} height={26} viewBox="0 0 26 26" aria-hidden focusable="false">
        <rect x={2} y={7} width={6} height={12} rx={1.5} fill="none" stroke={ink} strokeWidth={1.4} />
        <rect x={10} y={7} width={6} height={12} rx={1.5} fill="none" stroke={ink} strokeWidth={1.4} />
        <rect x={18} y={7} width={6} height={12} rx={1.5} fill="none" stroke={ink} strokeWidth={1.4} />
      </svg>
    ),
  },
  {
    id: "hero",
    label: "Hero",
    glyph: (ink) => (
      <svg width={26} height={26} viewBox="0 0 26 26" aria-hidden focusable="false">
        <rect x={2} y={4} width={22} height={18} rx={2} fill="none" stroke={ink} strokeWidth={1.4} />
        <path d="M6 18 L11 12 L15 16 L18 13 L21 18" fill="none" stroke={ink} strokeWidth={1.2} strokeLinejoin="round" />
      </svg>
    ),
  },
];

/** Hero height, drawn as how much of the viewport frame the band fills. */
export const CAROUSEL_HEIGHT_TILES: readonly GlyphTileOption[] = [
  { id: "viewport", label: "Full", valueCaption: "100vh", glyph: (ink) => <HeightGlyph ink={ink} fill={1} /> },
  { id: "large", label: "Large", valueCaption: "78vh", glyph: (ink) => <HeightGlyph ink={ink} fill={0.78} /> },
  { id: "medium", label: "Medium", valueCaption: "60vh", glyph: (ink) => <HeightGlyph ink={ink} fill={0.6} /> },
  { id: "fixed", label: "Exact", valueCaption: null, glyph: (ink) => <HeightGlyph ink={ink} fill={0.45} dashed /> },
];

function HeightGlyph({ ink, fill, dashed }: { ink: string; fill: number; dashed?: boolean }) {
  const outer = 22;
  const inner = Math.max(4, Math.round(outer * fill) - 4);
  return (
    <svg width={26} height={26} viewBox="0 0 26 26" aria-hidden focusable="false">
      <rect x={2} y={2} width={22} height={outer} rx={2} fill="none" stroke={ink} strokeWidth={1} opacity={0.35} />
      <rect
        x={4}
        y={4}
        width={18}
        height={inner}
        rx={1.5}
        fill="none"
        stroke={ink}
        strokeWidth={1.4}
        strokeDasharray={dashed ? "3 2" : undefined}
      />
    </svg>
  );
}

/** Crossfade vs slide, drawn as overlap versus displacement. */
export const CAROUSEL_TRANSITION_TILES: readonly GlyphTileOption[] = [
  {
    id: "crossfade",
    label: "Fade",
    glyph: (ink) => (
      <svg width={26} height={26} viewBox="0 0 26 26" aria-hidden focusable="false">
        <rect x={4} y={7} width={12} height={12} rx={1.5} fill="none" stroke={ink} strokeWidth={1.4} />
        <rect x={10} y={7} width={12} height={12} rx={1.5} fill="none" stroke={ink} strokeWidth={1.4} opacity={0.4} />
      </svg>
    ),
  },
  {
    id: "slide",
    label: "Slide",
    glyph: (ink) => (
      <svg width={26} height={26} viewBox="0 0 26 26" aria-hidden focusable="false">
        <rect x={2} y={7} width={10} height={12} rx={1.5} fill="none" stroke={ink} strokeWidth={1.4} />
        <path d="M15 13 H23 M20 10 L23 13 L20 16" fill="none" stroke={ink} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

/** Scrim tone, drawn as the actual wash it lays over the photo. */
export const CAROUSEL_SCRIM_TONE_TILES: readonly GlyphTileOption[] = [
  {
    id: "dark",
    label: "Dark",
    glyph: (ink) => <ScrimGlyph ink={ink} wash="rgba(18,18,18,0.55)" />,
  },
  {
    id: "light",
    label: "Light",
    glyph: (ink) => <ScrimGlyph ink={ink} wash="rgba(255,255,255,0.72)" />,
  },
];

function ScrimGlyph({ ink, wash }: { ink: string; wash: string }) {
  return (
    <svg width={26} height={26} viewBox="0 0 26 26" aria-hidden focusable="false">
      <rect x={3} y={5} width={20} height={16} rx={2} fill="none" stroke={ink} strokeWidth={1.2} />
      <path d="M6 18 L11 12 L15 16 L18 13 L20 15.5" fill="none" stroke={ink} strokeWidth={1} opacity={0.6} />
      <rect x={3.6} y={5.6} width={18.8} height={14.8} rx={1.6} fill={wash} />
    </svg>
  );
}
