"use client";

/**
 * Card Design studio — presentational parts + the per-surface vocabulary.
 * Split out of `CardDesignStudio.tsx` to keep each file within the shell's
 * max-lines budget. The main file owns state + engine wiring; this file owns
 * the surface rules, the appearance-draft shape, and the pure render helpers
 * (GroupHeader / Segmented / ToggleRow / PreviewCard).
 */

import { useState } from "react";
import { Bookmark, Check, Heart, Send } from "lucide-react";

import { Icon, Toggle } from "../primitives";
import { COLORS, FONTS, RADIUS, TRANSITION } from "../state";

// ────────────────────────────────────────────────────────────────────────
// Surfaces + per-surface action rules (baked product decision)
// ────────────────────────────────────────────────────────────────────────

export type CardSurface = "directory" | "pitch" | "roster" | "embedded";

type SurfaceRule = {
  label: string;
  tag: string;
  /** Whether the favorite (save) affordance is available on this surface. */
  favorite: boolean;
  /** Whether the client inquiry CTA is available on this surface. */
  inquiry: boolean;
  /** One-line rationale shown when the surface is active. */
  note: string;
};

export const SURFACE_RULES: Record<CardSurface, SurfaceRule> = {
  directory: {
    label: "Directory",
    tag: "Public",
    favorite: true,
    inquiry: true,
    note: "Public discovery grid. Clients can save a favorite and start an inquiry — both actions are on.",
  },
  pitch: {
    label: "Pitch",
    tag: "Sent link",
    favorite: false,
    inquiry: true,
    note: "You already curated and sent this shortlist, so a favorite is redundant. The card keeps a direct inquiry / reply action instead.",
  },
  roster: {
    label: "Roster",
    tag: "Internal",
    favorite: false,
    inquiry: false,
    note: "Your internal team grid. No client-facing favorite or inquiry — these cards are for managing talent, not selling them.",
  },
  embedded: {
    label: "Embedded",
    tag: "Public",
    favorite: true,
    inquiry: true,
    note: "Cards embedded on an external site behave like the Directory — both favorite and inquiry are available to the public.",
  },
};

export const SURFACE_ORDER: CardSurface[] = ["directory", "pitch", "roster", "embedded"];

// ────────────────────────────────────────────────────────────────────────
// Appearance draft — the card-relevant subset of directorySchemaV1, with the
// same defaults. Preview-only this release (see banner).
// ────────────────────────────────────────────────────────────────────────

export type CardStyle = "portrait" | "editorial";
export type CardAspect = "4:5" | "1:1" | "3:4" | "16:9";
export type HoverBehavior = "reveal_traits" | "zoom" | "swap" | "none";

export type CardAppearance = {
  cardStyle: CardStyle;
  cardAspect: CardAspect;
  hoverBehavior: HoverBehavior;
  showName: boolean;
  showTalentType: boolean;
  showLocation: boolean;
  showAttributes: boolean;
  showAvailability: boolean;
  showBadges: boolean;
  showRating: boolean;
  showPriceFrom: boolean;
  /** Within an action-allowed surface, the admin can still hide each one. */
  showSave: boolean;
  showAddToInquiry: boolean;
};

export const DEFAULT_APPEARANCE: CardAppearance = {
  cardStyle: "portrait",
  cardAspect: "4:5",
  hoverBehavior: "reveal_traits",
  showName: true,
  showTalentType: true,
  showLocation: true,
  showAttributes: true,
  showAvailability: true,
  showBadges: true,
  showRating: false,
  showPriceFrom: false,
  showSave: true,
  showAddToInquiry: true,
};

const ASPECT_RATIO: Record<CardAspect, number> = {
  "4:5": 4 / 5,
  "1:1": 1,
  "3:4": 3 / 4,
  "16:9": 16 / 9,
};

export const HOVER_LABEL: Record<HoverBehavior, string> = {
  reveal_traits: "Reveal traits",
  zoom: "Zoom image",
  swap: "Swap photo",
  none: "None",
};

export type FieldSaveState = "saving" | "saved" | "error";

// ────────────────────────────────────────────────────────────────────────
// Small layout helpers (pure presentation)
// ────────────────────────────────────────────────────────────────────────

export function GroupHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          fontFamily: FONTS.body,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: COLORS.inkMuted,
        }}
      >
        {title}
      </div>
      {hint ? (
        <div style={{ marginTop: 3, fontSize: 12, color: COLORS.inkDim, lineHeight: 1.45 }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

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

// ────────────────────────────────────────────────────────────────────────
// Preview card — faithful visual replica of a rendered talent card +
// <TalentCardActions>. Self-contained (no PublicDiscoveryState provider in
// the admin shell), so the favorite/inquiry are demo-interactive locally.
// ────────────────────────────────────────────────────────────────────────

export function PreviewCard({
  surface,
  appearance,
  favoriteIcon,
  fieldChips,
}: {
  surface: CardSurface;
  appearance: CardAppearance;
  favoriteIcon: "heart" | "bookmark";
  fieldChips: string[];
}) {
  const rule = SURFACE_RULES[surface];
  const [demoFav, setDemoFav] = useState(false);
  const [demoInquiry, setDemoInquiry] = useState(false);

  const showFavorite = rule.favorite && appearance.showSave;
  const showInquiry = rule.inquiry && appearance.showAddToInquiry;
  const editorial = appearance.cardStyle === "editorial";

  const FavGlyph = favoriteIcon === "bookmark" ? Bookmark : Heart;

  const nameBlock = (
    <>
      {appearance.showName ? (
        <div
          style={{
            fontFamily: FONTS.display,
            fontSize: 16,
            fontWeight: 600,
            color: editorial ? "#fff" : COLORS.ink,
            lineHeight: 1.2,
          }}
        >
          Tina Rossi
        </div>
      ) : null}
      {appearance.showTalentType ? (
        <div
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: editorial ? "rgba(255,255,255,0.82)" : COLORS.inkMuted,
            marginTop: 2,
          }}
        >
          Fashion Model
        </div>
      ) : null}
    </>
  );

  return (
    <div
      data-tulala-card-design-preview-card
      style={{
        width: 260,
        maxWidth: "100%",
        background: COLORS.card,
        border: `1px solid ${COLORS.border}`,
        borderRadius: RADIUS.lg,
        overflow: "hidden",
        boxShadow: COLORS.shadowHover,
        fontFamily: FONTS.body,
      }}
    >
      {/* Image area */}
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: String(ASPECT_RATIO[appearance.cardAspect]),
          background: `linear-gradient(150deg, ${COLORS.accentSoft}, ${COLORS.indigoSoft})`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            fontFamily: FONTS.display,
            fontSize: 40,
            fontWeight: 600,
            color: "rgba(11,11,13,0.18)",
          }}
        >
          TR
        </span>

        {/* Availability dot */}
        {appearance.showAvailability ? (
          <span
            style={{
              position: "absolute",
              top: 10,
              left: 10,
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              background: "rgba(255,255,255,0.92)",
              borderRadius: 999,
              padding: "3px 8px",
              fontSize: 10.5,
              fontWeight: 600,
              color: COLORS.successDeep,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.success }} />
            Available
          </span>
        ) : null}

        {/* Favorite — top-right overlay, matches TalentCardActions circle */}
        {showFavorite ? (
          <button
            type="button"
            aria-pressed={demoFav}
            aria-label={demoFav ? "Remove Tina Rossi from favorites" : "Save Tina Rossi to favorites"}
            onClick={() => setDemoFav((v) => !v)}
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              width: 34,
              height: 34,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "50%",
              border: `1px solid ${COLORS.border}`,
              background: "rgba(255,255,255,0.85)",
              backdropFilter: "blur(4px)",
              color: demoFav ? COLORS.accent : COLORS.inkMuted,
              cursor: "pointer",
              transition: `color ${TRANSITION.sm}`,
            }}
          >
            <FavGlyph size={16} fill={demoFav ? "currentColor" : "none"} aria-hidden />
          </button>
        ) : null}

        {/* Editorial overlay name */}
        {editorial && (appearance.showName || appearance.showTalentType) ? (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              padding: "28px 12px 12px",
              background: "linear-gradient(to top, rgba(11,11,13,0.72), transparent)",
            }}
          >
            {nameBlock}
          </div>
        ) : null}
      </div>

      {/* Body */}
      <div style={{ padding: 12 }}>
        {!editorial ? nameBlock : null}

        {appearance.showLocation ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              marginTop: 6,
              fontSize: 12,
              color: COLORS.inkMuted,
            }}
          >
            <Icon name="map-pin" size={12} color={COLORS.inkDim} />
            Milano, IT
          </div>
        ) : null}

        {appearance.showRating ? (
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6, fontSize: 12, color: COLORS.inkMuted }}>
            <Icon name="star" size={12} color={COLORS.amber} />
            4.9 · 32 bookings
          </div>
        ) : null}

        {appearance.showPriceFrom ? (
          <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, color: COLORS.ink }}>
            From €850 / day
          </div>
        ) : null}

        {/* Engine fields — the card-visible field_definitions */}
        {appearance.showAttributes && fieldChips.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 10 }}>
            {fieldChips.map((chip) => (
              <span
                key={chip}
                style={{
                  fontSize: 10.5,
                  fontWeight: 500,
                  color: COLORS.inkMuted,
                  background: COLORS.surfaceAlt,
                  border: `1px solid ${COLORS.borderSoft}`,
                  borderRadius: 999,
                  padding: "3px 8px",
                }}
              >
                {chip}
              </span>
            ))}
          </div>
        ) : null}

        {appearance.showBadges ? (
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 10 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 10.5,
                fontWeight: 600,
                color: COLORS.accentDeep,
                background: COLORS.accentSoft,
                borderRadius: 999,
                padding: "3px 8px",
              }}
            >
              <Icon name="check" size={11} color={COLORS.accent} />
              Verified
            </span>
          </div>
        ) : null}

        {/* Inquiry CTA — matches TalentCardActions inquiry pill */}
        {showInquiry ? (
          <button
            type="button"
            aria-pressed={demoInquiry}
            onClick={() => setDemoInquiry((v) => !v)}
            style={{
              marginTop: 12,
              width: "100%",
              height: 36,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              borderRadius: RADIUS.md,
              border: `1px solid ${demoInquiry ? COLORS.ink : COLORS.border}`,
              background: demoInquiry ? "rgba(11,11,13,0.06)" : "transparent",
              color: COLORS.ink,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              cursor: "pointer",
              transition: `border-color ${TRANSITION.sm}`,
            }}
          >
            {demoInquiry ? <Check size={14} aria-hidden /> : <Send size={14} aria-hidden />}
            {demoInquiry ? "Added" : "Inquire"}
          </button>
        ) : null}

        {!showFavorite && !showInquiry ? (
          <div
            style={{
              marginTop: 12,
              fontSize: 11,
              color: COLORS.inkDim,
              fontStyle: "italic",
            }}
          >
            No client actions on this surface.
          </div>
        ) : null}
      </div>
    </div>
  );
}
