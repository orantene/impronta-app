"use client";

/**
 * Card Design studio — presentational helpers barrel.
 *
 * This file owns `Segmented` and `ToggleRow` (the generic UI atoms used in the
 * main studio). Everything else — surface/appearance vocabulary, preview cards,
 * kit/color/publish components, and the two layout-helper compounds
 * (DesignLookSection / CardDesignPreviewColumn) — lives in
 * `CardDesignStudio-3.tsx` and is re-exported here so all consumers continue
 * to import from a single `-2` path.
 */

import { Icon, Toggle } from "../primitives";
import { COLORS, FONTS, TRANSITION } from "../state";

// ────────────────────────────────────────────────────────────────────────
// Segmented — pill-style option group, used for card style / aspect / hover.
// ────────────────────────────────────────────────────────────────────────

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="group"
      style={{
        display: "inline-flex",
        flexWrap: "wrap",
        gap: 3,
        background: COLORS.surfaceAlt,
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 999,
        padding: 3,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            style={{
              border: "none",
              borderRadius: 999,
              padding: "5px 12px",
              fontFamily: FONTS.body,
              fontSize: 12,
              fontWeight: active ? 600 : 500,
              cursor: disabled ? "not-allowed" : "pointer",
              background: active ? COLORS.card : "transparent",
              color: active ? COLORS.ink : COLORS.inkMuted,
              boxShadow: active ? COLORS.shadow : "none",
              transition: `background ${TRANSITION.micro}`,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// ToggleRow — label + optional lock badge + toggle, used for show-flags.
// ────────────────────────────────────────────────────────────────────────

export function ToggleRow({
  label,
  hint,
  on,
  onChange,
  disabled,
  locked,
}: {
  label: string;
  hint?: string;
  on: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
  locked?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "8px 0",
        opacity: disabled && !locked ? 0.55 : 1,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontFamily: FONTS.body,
            fontSize: 13,
            fontWeight: 500,
            color: COLORS.ink,
          }}
        >
          {locked ? <Icon name="lock" size={12} color={COLORS.inkDim} /> : null}
          {label}
        </div>
        {hint ? (
          <div style={{ marginTop: 2, fontSize: 11.5, color: COLORS.inkDim, lineHeight: 1.4 }}>
            {hint}
          </div>
        ) : null}
      </div>
      {locked ? (
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            color: COLORS.inkDim,
            whiteSpace: "nowrap",
          }}
        >
          Off here
        </span>
      ) : (
        <Toggle on={on} onChange={onChange} label={label} />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Everything else — re-exported from CardDesignStudio-3.tsx.
//
// Implementations live in -3 so both this file and the main studio stay
// under the shell's 800-line budget. The public import surface is unchanged.
// ════════════════════════════════════════════════════════════════════════

export {
  // Surface + appearance vocabulary
  type CardSurface,
  type CardStyle,
  type CardAspect,
  type HoverBehavior,
  type CardAppearance,
  type FieldSaveState,
  SURFACE_RULES,
  SURFACE_ORDER,
  DEFAULT_APPEARANCE,
  HOVER_LABEL,
  // Preview cards
  GroupHeader,
  PreviewCard,
  // Kit / color / publish vocabulary
  type CardKitOption,
  type DesignSaveState,
  type DesignPublishState,
  CARD_FAMILY_TOKEN_KEY,
  CARD_COLOR_KNOBS,
  CARD_DESIGN_TOKEN_KEYS,
  CARD_PREVIEW_SAMPLE,
  isHex,
  CardKitChooser,
  ColorKnob,
  DesignSaveStatus,
} from "./CardDesignStudio-3";

// Section-level compounds + roster preview — implemented in -4 (a leaf that
// imports the atoms above from -3), re-exported here so the public import
// surface stays a single `-2` path.
export {
  RosterBadgePreviewCard,
  PublishCluster,
  CardLivePreview,
  DesignLookSection,
  CardDesignPreviewColumn,
  CardSurfaceTabStrip,
} from "./CardDesignStudio-4";
