"use client";

/**
 * StylePanel · QUICK STYLES as visual cards (mockup annotation C).
 *
 * "Quick styles are the front door. The three curated looks become visual cards
 * you can read at a glance — the single best existing idea, promoted from a
 * text list."
 *
 * What shipped before this file: a one-column stack of grey text buttons, label
 * over hint, indistinguishable from every other list in the panel. The presets
 * themselves were already good — "Editorial title", "Quiet kicker" — but the
 * control gave an operator no reason to believe one differed from another
 * except by reading two lines of prose per card.
 *
 * ── THE THUMBNAIL IS DERIVED, NOT DRAWN ────────────────────────────────────
 * The mini preview is generated FROM THE PRESET'S OWN `style` object — its
 * align, size, tone, max-width, radius, background and shadow. Nothing is
 * hand-authored per preset, so a preset cannot end up illustrated by a picture
 * of a different preset, and adding a preset upstream gets a correct thumbnail
 * for free. Where a preset says nothing about a property the thumbnail says
 * nothing either; it never invents a look to fill the tile.
 *
 * It is deliberately a SCHEMATIC (bars, not text): the real type is fluid
 * `clamp()` and a 34px tile cannot honestly render it. Bars can honestly render
 * relative width, alignment, weight and the surface the block sits on, which is
 * what distinguishes these three presets from each other.
 */

import type { CSSProperties } from "react";

import type { BuilderNodeStyleValue } from "@/lib/site-admin/builder-node";
import { FIELD_KIT } from "../field-kit";
import { useInspectorT } from "../kit/use-inspector-t";
import { INSPECTOR_FIELD_LABEL_CLASS as FIELD_LABEL } from "../kit/inspector-ui";

export interface QuickStylePreset {
  id: string;
  label: string;
  hint: string;
  style?: BuilderNodeStyleValue;
}

export interface QuickStyleCardsProps {
  presets: ReadonlyArray<QuickStylePreset>;
  onApply: (preset: QuickStylePreset) => void;
  /** Which device the click will write to — the panel's existing caveat. */
  scopeLabel: string;
}

/** Bar widths per size tier, as a fraction of the tile. Relative, not absolute. */
const WIDTH_BY_SIZE: Record<string, number> = {
  sm: 0.5,
  md: 0.66,
  lg: 0.82,
  xl: 0.92,
  display: 1,
};

/** Bar widths per max-width preset — the measure the block is constrained to. */
const WIDTH_BY_MEASURE: Record<string, number> = {
  narrow: 0.5,
  reading: 0.72,
  wide: 0.9,
  full: 1,
};

export function QuickStyleCards({ presets, onApply, scopeLabel }: QuickStyleCardsProps) {
  const { t } = useInspectorT();
  if (presets.length === 0) return null;

  return (
    <div className="flex flex-col gap-2" data-builder-node-style-control="quick-presets">
      <div className="flex items-end justify-between gap-2">
        <span className={FIELD_LABEL}>{t("Quick styles")}</span>
        <span
          style={{
            fontSize: FIELD_KIT.font.caption,
            fontWeight: FIELD_KIT.weight.caption,
            color: FIELD_KIT.muted,
          }}
        >
          {t("Applies to {device}").replace("{device}", t(scopeLabel))}
        </span>
      </div>
      <div
        data-quick-style-cards=""
        style={{
          display: "grid",
          // Three across is the mockup. Two presets get wider cards rather
          // than a ragged third column.
          gridTemplateColumns: `repeat(${Math.min(3, Math.max(presets.length, 1))}, minmax(0, 1fr))`,
          gap: FIELD_KIT.gap.control,
        }}
      >
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            data-builder-node-style-preset={preset.id}
            title={preset.hint}
            onClick={() => onApply(preset)}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              padding: "8px 8px 7px",
              minWidth: 0,
              textAlign: "center",
              borderRadius: FIELD_KIT.radius.tile,
              border: `1px solid ${FIELD_KIT.border}`,
              background: FIELD_KIT.surface,
              cursor: "pointer",
              transition: `border-color ${FIELD_KIT.motion.duration}ms ${FIELD_KIT.motion.easing}`,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = FIELD_KIT.accent;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = FIELD_KIT.border;
            }}
          >
            <QuickStyleThumb style={preset.style} />
            <span
              style={{
                fontSize: FIELD_KIT.font.caption,
                fontWeight: FIELD_KIT.weight.label,
                lineHeight: 1.2,
                color: FIELD_KIT.ink,
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {t(preset.label)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The schematic. Every visual decision below reads a real key off the preset's
 * style; there is no `switch (preset.id)` anywhere, by design.
 */
function QuickStyleThumb({ style }: { style: BuilderNodeStyleValue | undefined }) {
  const dark = style?.background === "contrast";
  const onSurface = style?.background === "surface";
  const align = style?.align ?? "left";
  const measure = WIDTH_BY_MEASURE[style?.maxWidth ?? ""] ?? 1;
  const lead = (WIDTH_BY_SIZE[style?.size ?? ""] ?? 0.7) * measure;
  const strong = style?.tone === "strong";
  const muted = style?.tone === "muted";

  const barInk = dark
    ? strong
      ? "rgba(255,255,255,0.78)"
      : "rgba(255,255,255,0.42)"
    : strong
      ? "rgba(24,24,27,0.42)"
      : muted
        ? "rgba(24,24,27,0.16)"
        : "rgba(24,24,27,0.26)";

  const frame: CSSProperties = {
    height: 34,
    borderRadius: 6,
    // `radius: "pill"` on a 34px tile would read as a lozenge, not as a corner
    // treatment, so the schematic caps the bend it will draw.
    ...(style?.radius === "pill" ? { borderRadius: 12 } : {}),
    background: dark ? "#26262b" : onSurface ? "rgba(24,24,27,0.05)" : "rgba(24,24,27,0.03)",
    boxShadow: style?.boxShadow ? "0 2px 5px rgba(15,18,35,0.18)" : "none",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems:
      align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start",
    gap: 3,
    padding: "0 6px",
    overflow: "hidden",
  };

  return (
    <span aria-hidden style={frame}>
      <span
        style={{
          display: "block",
          height: strong ? 5 : 4,
          width: `${Math.round(lead * 100)}%`,
          borderRadius: 2,
          background: barInk,
        }}
      />
      <span
        style={{
          display: "block",
          height: 3,
          width: `${Math.round(lead * 72)}%`,
          borderRadius: 2,
          background: dark ? "rgba(255,255,255,0.22)" : "rgba(24,24,27,0.13)",
        }}
      />
    </span>
  );
}
