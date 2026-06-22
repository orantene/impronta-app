"use client";

/**
 * Card Design studio — presentational parts + the per-surface vocabulary.
 * Split out of `CardDesignStudio.tsx` to keep each file within the shell's
 * max-lines budget. The main file owns state + engine wiring; this file owns
 * the surface rules, the appearance-draft shape, and the pure render helpers
 * (GroupHeader / Segmented / ToggleRow / PreviewCard).
 */

import { useState } from "react";
import { Bookmark, Check, Eye, Heart, Send } from "lucide-react";

import { Icon, Toggle } from "../primitives";
import { COLORS, FONTS, RADIUS, TRANSITION } from "../state";
import type { RosterCardBadgePrefs } from "@/lib/talent-cards/roster-card-badges";
import { TalentCard } from "@/components/talent-cards/TalentCard";
import type { DirectoryCardData } from "@/components/talent-cards/talent-card-shape";

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

// ────────────────────────────────────────────────────────────────────────
// Roster badge preview — faithful replica of a real RosterCard's overlay
// stack, gated by the live badge prefs. The Roster surface in the studio
// swaps PreviewCard for this so the admin sees exactly which corner each
// toggle controls. Pill base matches OVERLAY_PILL_BASE in TalentPage-2.
// ────────────────────────────────────────────────────────────────────────

const PREVIEW_PILL_BASE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  height: 22,
  padding: "0 8px",
  borderRadius: 999,
  background: "rgba(11,11,13,0.62)",
  border: "1px solid rgba(255,255,255,0.14)",
  color: "#fff",
  fontSize: 10,
  fontWeight: 600,
  lineHeight: 1,
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
};

export function RosterBadgePreviewCard({ badges }: { badges: RosterCardBadgePrefs }) {
  return (
    <div
      data-tulala-roster-badge-preview
      style={{
        width: 240,
        maxWidth: "100%",
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: COLORS.shadowHover,
        fontFamily: FONTS.body,
      }}
    >
      {/* Photo area — 4:5 like the real roster card */}
      <div
        style={{
          position: "relative",
          aspectRatio: "4 / 5",
          background: `linear-gradient(150deg, ${COLORS.accentSoft}, ${COLORS.indigoSoft})`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            fontFamily: FONTS.display,
            fontSize: 38,
            fontWeight: 600,
            color: "rgba(11,11,13,0.18)",
            userSelect: "none",
          }}
        >
          TR
        </span>

        {/* Top-right stack: visibility eye + Discover pill */}
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 5,
            zIndex: 2,
          }}
        >
          {badges.visibility ? (
            <span
              title="Visibility eye — the live show / hide control for the agency site"
              style={{
                width: 30,
                height: 30,
                borderRadius: 999,
                border: `1px solid ${COLORS.accent}`,
                background: COLORS.accent,
                color: "#fff",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 1px 4px rgba(11,11,13,0.16)",
              }}
            >
              <Eye size={15} aria-hidden />
            </span>
          ) : null}
          {badges.discover ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "3px 9px",
                borderRadius: 999,
                background: "rgba(46,125,91,0.92)",
                color: "#fff",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 0.3,
                textTransform: "uppercase",
                boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
              }}
            >
              Discover
            </span>
          ) : null}
        </div>

        {/* Bottom-left stack: completeness % + photo count */}
        <div
          style={{
            position: "absolute",
            bottom: 8,
            left: 8,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            zIndex: 2,
          }}
        >
          {badges.completeness ? <span style={PREVIEW_PILL_BASE}>82%</span> : null}
          {badges.photoCount ? (
            <span style={PREVIEW_PILL_BASE}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="6" width="18" height="14" rx="2" />
                <circle cx="12" cy="13" r="3.2" />
                <path d="M8 6l1.5-2h5L16 6" />
              </svg>
              12
            </span>
          ) : null}
        </div>

        {/* Bottom-right stack: verified mark + availability pill + canonical
            TAL-ID — stacked vertically so none overlap (mirrors the real card). */}
        <div
          style={{
            position: "absolute",
            bottom: 8,
            right: 8,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 4,
            zIndex: 2,
          }}
        >
          {badges.trust ? (
            <span
              title="Tulala Verified"
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: COLORS.success,
                boxShadow: "0 0 0 2px #fff, 0 1px 3px rgba(11,11,13,0.20)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
              }}
            >
              <Check size={11} strokeWidth={3} aria-hidden />
            </span>
          ) : null}
          {badges.availability ? (
            <span
              style={{
                ...PREVIEW_PILL_BASE,
                background: "rgba(255,255,255,0.92)",
                border: "1px solid rgba(11,11,13,0.06)",
                color: COLORS.ink,
                textTransform: "capitalize",
                boxShadow: "0 1px 4px rgba(11,11,13,0.10)",
              }}
            >
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: COLORS.green }} />
              available
            </span>
          ) : null}
          {badges.talentId ? (
            <span
              style={{
                ...PREVIEW_PILL_BASE,
                fontWeight: 700,
                letterSpacing: 0.3,
                fontFamily: FONTS.mono,
              }}
            >
              TAL-00042
            </span>
          ) : null}
        </div>
      </div>

      {/* Body — name + type + city always show, like the real roster card */}
      <div style={{ padding: "10px 12px 12px" }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: -0.1, color: COLORS.ink }}>
          Tina Rossi
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: COLORS.accentDeep,
            fontWeight: 600,
            marginTop: 2,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <span aria-hidden style={{ fontSize: 12, opacity: 0.85 }}>📸</span>
          Fashion Model
        </div>
        <div style={{ fontSize: 11, marginTop: 1, color: COLORS.inkMuted }}>📍 Milano, IT</div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Visual design — kit chooser + color knobs + LIVE canonical-card preview.
//
// This is the REAL persistence half of the studio (the folded-in P2.2 visual
// studio): a kit / color edit writes the card-family tokens
// (template.directory-card-family + card.surface / card.name-color /
// card.muted) into the agency design draft via the design actions, and one
// Publish promotes the draft live so every <TalentCard> repaints with zero
// per-card edits. The vocabulary below is shared by CardDesignStudio.tsx,
// which owns the action wiring + async state.
//
// Admin chrome stays neutral / cool — the ONLY gold lives inside the right-
// hand <TalentCard> preview, which is the public editorial card painting from
// its own published tokens.
// ════════════════════════════════════════════════════════════════════════

/** A talent-card kit (a named subset of card-family tokens). */
export type CardKitOption = {
  slug: string;
  label: string;
  description: string;
  tokens: Record<string, string>;
};

/** The card-family token key that records which kit is active. */
export const CARD_FAMILY_TOKEN_KEY = "template.directory-card-family";

/** The three color knobs the studio exposes, in display order. */
export const CARD_COLOR_KNOBS: Array<{ key: string; label: string; hint: string }> = [
  { key: "card.surface", label: "Card surface", hint: "Media / panel ground" },
  { key: "card.name-color", label: "Name color", hint: "Talent name" },
  { key: "card.muted", label: "Secondary text", hint: "Type · location · availability" },
];

/** Every card-family token key the studio touches (kit + knobs). */
export const CARD_DESIGN_TOKEN_KEYS: string[] = [
  CARD_FAMILY_TOKEN_KEY,
  ...CARD_COLOR_KNOBS.map((k) => k.key),
];

/**
 * Realistic sample talent for the live preview. Editorial portrait imagery,
 * never initials-in-a-box (product rule). Rendered with the editorial style so
 * the name + muted tokens are visible (portrait keeps the name white over the
 * scrim).
 */
export const CARD_PREVIEW_SAMPLE: DirectoryCardData = {
  id: "preview-sample",
  name: "Mara Delacroix",
  profileCode: null,
  profileHref: "#",
  primaryType: "Editorial Model",
  location: "Mexico City",
  photoUrl:
    "https://images.unsplash.com/photo-1492288991661-058aa541ff43?auto=format&fit=crop&w=900&q=80",
  agencyName: "Casa Noir",
  isExclusive: true,
  availabilityLabel: "Available this month",
  availabilityKnown: true,
  availableDaysInNext30: 12,
};

export type DesignSaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; version: number }
  | { kind: "error"; message: string };

export type DesignPublishState =
  | { kind: "idle" }
  | { kind: "publishing" }
  | { kind: "published"; version: number }
  | { kind: "error"; message: string };

export function isHex(value: string): boolean {
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}

/** A tiny tri-swatch preview of a kit's surface / name / muted colors. */
function KitSwatch({ tokens }: { tokens: Record<string, string> }) {
  const surface = tokens["card.surface"] ?? "#f4f4f5";
  const name = tokens["card.name-color"] ?? "#171717";
  const muted = tokens["card.muted"] ?? "#6b7280";
  return (
    <div
      style={{
        height: 48,
        borderRadius: 8,
        background: surface,
        border: `1px solid ${COLORS.border}`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        gap: 4,
        padding: 8,
      }}
    >
      <span style={{ width: "70%", height: 6, borderRadius: 3, background: name }} />
      <span style={{ width: "45%", height: 5, borderRadius: 3, background: muted }} />
    </div>
  );
}

/**
 * One-click kit chooser. Picking a tile calls back to the studio, which runs
 * `applyCardKitFromEditAction` and reflects the kit's tokens in the working
 * draft so the preview repaints instantly.
 */
export function CardKitChooser({
  kits,
  activeSlug,
  pendingSlug,
  canEdit,
  onApply,
}: {
  kits: ReadonlyArray<CardKitOption>;
  activeSlug: string;
  pendingSlug: string | null;
  canEdit: boolean;
  onApply: (kit: CardKitOption) => void;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
      {kits.map((kit) => {
        const selected = activeSlug === kit.slug;
        const busy = pendingSlug === kit.slug;
        return (
          <button
            key={kit.slug}
            type="button"
            disabled={!canEdit || busy}
            onClick={() => onApply(kit)}
            aria-pressed={selected}
            style={{
              textAlign: "left",
              padding: 12,
              borderRadius: 10,
              border: `1.5px solid ${selected ? COLORS.accent : COLORS.border}`,
              background: selected ? COLORS.accentSoft : COLORS.card,
              cursor: !canEdit || busy ? "default" : "pointer",
              opacity: !canEdit ? 0.6 : 1,
              transition: `border-color ${TRANSITION.sm}, background ${TRANSITION.sm}`,
              fontFamily: FONTS.body,
            }}
          >
            <KitSwatch tokens={kit.tokens} />
            <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.ink }}>{kit.label}</span>
              {selected ? (
                <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: COLORS.accent }}>
                  {busy ? "Applying" : "Active"}
                </span>
              ) : null}
            </div>
            <div style={{ marginTop: 3, fontSize: 11.5, color: COLORS.inkMuted, lineHeight: 1.4 }}>
              {kit.description}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/** A single native color knob with an inherit-from-theme empty state. */
export function ColorKnob({
  label,
  hint,
  value,
  disabled,
  onChange,
  onClear,
}: {
  label: string;
  hint: string;
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
  onClear: () => void;
}) {
  const hasValue = isHex(value);
  // The native color input needs a concrete hex; show a neutral when inherited.
  const swatchValue = hasValue ? value : "#cccccc";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "9px 0",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.ink }}>{label}</div>
        <div style={{ fontSize: 11, color: COLORS.inkDim, marginTop: 1 }}>
          {hasValue ? hint : `${hint} · inherits theme`}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="color"
          aria-label={label}
          disabled={disabled}
          value={swatchValue}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: 34,
            height: 28,
            padding: 0,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 6,
            background: COLORS.card,
            cursor: disabled ? "default" : "pointer",
            opacity: hasValue ? 1 : 0.55,
          }}
        />
        {hasValue && !disabled ? (
          <button
            type="button"
            onClick={onClear}
            style={{
              padding: "3px 8px",
              fontSize: 11,
              fontWeight: 600,
              fontFamily: FONTS.body,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 6,
              background: COLORS.card,
              color: COLORS.inkMuted,
              cursor: "pointer",
            }}
          >
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Explicit, persistent draft-save status. Never a toast-and-vanish. */
export function DesignSaveStatus({ state }: { state: DesignSaveState }) {
  if (state.kind === "idle") return null;
  let label: string;
  let color: string;
  let bg: string;
  if (state.kind === "saving") {
    label = "Saving draft…";
    color = COLORS.inkMuted;
    bg = COLORS.surfaceAlt;
  } else if (state.kind === "saved") {
    label = `Draft saved · v${state.version}`;
    color = COLORS.successDeep;
    bg = COLORS.successSoft;
  } else {
    label = state.message;
    color = COLORS.critical;
    bg = COLORS.criticalSoft;
  }
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        marginTop: 12,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 10px",
        borderRadius: 6,
        background: bg,
        color,
        fontSize: 11.5,
        fontWeight: 600,
      }}
    >
      {label}
    </div>
  );
}

/** Persistent Publish button + explicit lifecycle line. */
export function PublishCluster({
  canPublish,
  dirty,
  publishState,
  publishedAt,
  onPublish,
}: {
  canPublish: boolean;
  dirty: boolean;
  publishState: DesignPublishState;
  publishedAt: string | null;
  onPublish: () => void;
}) {
  const publishing = publishState.kind === "publishing";
  let line: string;
  if (publishState.kind === "error") {
    line = publishState.message;
  } else if (publishState.kind === "published") {
    line = `Published v${publishState.version} · live everywhere`;
  } else if (!canPublish) {
    line = "You can edit the draft; publishing needs publish access.";
  } else if (dirty) {
    line = "Unpublished changes in the draft.";
  } else if (publishedAt) {
    line = `Live · last published ${fmtPublishDate(publishedAt)}`;
  } else {
    line = "Nothing published yet.";
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
      <button
        type="button"
        disabled={!canPublish || publishing}
        onClick={onPublish}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 16px",
          fontSize: 13,
          fontWeight: 700,
          fontFamily: FONTS.body,
          border: "none",
          borderRadius: RADIUS.md,
          background: canPublish ? COLORS.accent : "rgba(11,11,13,0.18)",
          color: "#fff",
          cursor: !canPublish || publishing ? "default" : "pointer",
          opacity: publishing ? 0.7 : 1,
        }}
      >
        {publishing ? "Publishing…" : "Publish"}
      </button>
      <div
        role="status"
        aria-live="polite"
        style={{
          fontSize: 11,
          color: publishState.kind === "error" ? COLORS.critical : COLORS.inkMuted,
          textAlign: "right",
          maxWidth: 220,
        }}
      >
        {line}
      </div>
    </div>
  );
}

function fmtPublishDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * LIVE preview of the canonical <TalentCard>. The wrapper sets
 * `--token-card-surface / -name-color / -muted` from the working draft inline,
 * so every edit repaints the card instantly — exactly what the live storefront
 * card will look like once published. An empty token = no var = the card falls
 * back to the theme color (the inherit contract). This is the ONLY place gold
 * may appear in the studio (it's the public editorial card).
 */
export function CardLivePreview({ draft }: { draft: Record<string, string> }) {
  const previewVars: React.CSSProperties = {
    ...(isHex(draft["card.surface"] ?? "")
      ? { ["--token-card-surface" as string]: draft["card.surface"] }
      : {}),
    ...(isHex(draft["card.name-color"] ?? "")
      ? { ["--token-card-name-color" as string]: draft["card.name-color"] }
      : {}),
    ...(isHex(draft["card.muted"] ?? "")
      ? { ["--token-card-muted" as string]: draft["card.muted"] }
      : {}),
  };

  return (
    <div
      style={{
        padding: 18,
        borderRadius: RADIUS.xl,
        border: `1px solid ${COLORS.border}`,
        // Quiet ground; the card paints its own surface from the tokens so the
        // preview reads true.
        background: COLORS.surfaceAlt,
        ...previewVars,
      }}
    >
      <div style={{ width: 240, maxWidth: "100%", margin: "0 auto" }}>
        <TalentCard
          data={CARD_PREVIEW_SAMPLE}
          style="editorial"
          show={{
            showName: true,
            showTalentType: true,
            showLocation: true,
            showAvailability: true,
            showBadges: true,
          }}
          nameFallback="role"
          aspect="4:5"
          priority
        />
      </div>
    </div>
  );
}
