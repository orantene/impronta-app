"use client";

/**
 * Card Design studio — visual-design vocabulary.
 *
 * Owns the card-kit / color-knob / live-preview building blocks that were
 * extracted from `CardDesignStudio-2.tsx` to keep every file under the shell's
 * 800-line budget. `CardDesignStudio-2.tsx` re-exports everything here so the
 * public import surface is unchanged. `CardDesignStudio.tsx` consumes them via
 * the `-2` barrel.
 *
 * Admin chrome stays neutral / cool — the ONLY place gold appears is inside the
 * right-hand <TalentCard> live preview, which is the public editorial card
 * painting from its own published tokens.
 */

import { useState } from "react";
import { Bookmark, Check, Heart, Send } from "lucide-react";

import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { Icon } from "../primitives";
import { COLORS, FONTS, RADIUS, TRANSITION } from "../state";
import type { DirectoryCardData } from "@/components/talent-cards/talent-card-shape";

// ────────────────────────────────────────────────────────────────────────
// Appearance draft — the card-relevant subset of directorySchemaV1, with the
// same defaults. Preview-only this release (see banner in the main studio).
// ────────────────────────────────────────────────────────────────────────

export type CardSurface = "directory" | "pitch" | "roster" | "embedded";

type SurfaceRule = {
  /** English fallback for non-UI consumers; UI renders `t(labelKey)`. */
  label: string;
  tag: string;
  labelKey: string;
  tagKey: string;
  /** Whether the favorite (save) affordance is available on this surface. */
  favorite: boolean;
  /** Whether the client inquiry CTA is available on this surface. */
  inquiry: boolean;
  /** One-line rationale shown when the surface is active. */
  note: string;
  noteKey: string;
};

const SURFACE_NS = "dashboard.adminCardStudio2.surfaces";
export const SURFACE_RULES: Record<CardSurface, SurfaceRule> = {
  directory: {
    label: "Directory", tag: "Public", favorite: true, inquiry: true,
    labelKey: `${SURFACE_NS}.directoryLabel`, tagKey: `${SURFACE_NS}.directoryTag`,
    noteKey: `${SURFACE_NS}.directoryNote`,
    note: "Public discovery grid. Clients can save a favorite and start an inquiry, both actions are on.",
  },
  pitch: {
    label: "Pitch", tag: "Sent link", favorite: false, inquiry: true,
    labelKey: `${SURFACE_NS}.pitchLabel`, tagKey: `${SURFACE_NS}.pitchTag`,
    noteKey: `${SURFACE_NS}.pitchNote`,
    note: "You already curated and sent this shortlist, so a favorite is redundant. The card keeps a direct inquiry / reply action instead.",
  },
  roster: {
    label: "Roster", tag: "Internal", favorite: false, inquiry: false,
    labelKey: `${SURFACE_NS}.rosterLabel`, tagKey: `${SURFACE_NS}.rosterTag`,
    noteKey: `${SURFACE_NS}.rosterNote`,
    note: "Your internal team grid. No client-facing favorite or inquiry, these cards are for managing talent, not selling them.",
  },
  embedded: {
    label: "Embedded", tag: "Public", favorite: true, inquiry: true,
    labelKey: `${SURFACE_NS}.embeddedLabel`, tagKey: `${SURFACE_NS}.embeddedTag`,
    noteKey: `${SURFACE_NS}.embeddedNote`,
    note: "Cards embedded on an external site behave like the Directory, both favorite and inquiry are available to the public.",
  },
};

export const SURFACE_ORDER: CardSurface[] = ["directory", "pitch", "roster", "embedded"];

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
  // Matches the live section default (directory schema v2 backfilled
  // showPriceFrom:true) so the studio preview no longer contradicts the
  // published directory. Round-tripping the REAL knob is still open — see
  // the TODO(reviewer) in CardDesignStudio.tsx.
  showPriceFrom: true,
  showSave: true,
  showAddToInquiry: true,
};

export const HOVER_LABEL: Record<HoverBehavior, string> = {
  reveal_traits: "Reveal traits",
  zoom: "Zoom image",
  swap: "Swap photo",
  none: "None",
};

/** Catalog keys for HOVER_LABEL. UI renders `t(HOVER_LABEL_KEY[h])`. */
export const HOVER_LABEL_KEY: Record<HoverBehavior, string> = {
  reveal_traits: "dashboard.adminCardStudio2.hover.revealTraits",
  zoom: "dashboard.adminCardStudio2.hover.zoom",
  swap: "dashboard.adminCardStudio2.hover.swap",
  none: "dashboard.adminCardStudio2.hover.none",
};

export type FieldSaveState = "saving" | "saved" | "error";

// ────────────────────────────────────────────────────────────────────────
// Small layout helpers (pure presentation) — moved here from -2 so
// GroupHeader/PreviewCard/CardDesignPreviewColumn can share this file.
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

const ASPECT_RATIO: Record<CardAspect, number> = {
  "4:5": 4 / 5,
  "1:1": 1,
  "3:4": 3 / 4,
  "16:9": 16 / 9,
};

// ────────────────────────────────────────────────────────────────────────
// PreviewCard — faithful visual replica of a rendered talent card +
// <TalentCardActions>. Self-contained; favorite/inquiry are demo-interactive.
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
  const t = useT();
  const rule = SURFACE_RULES[surface];
  const [demoFav, setDemoFav] = useState(false);
  const [demoInquiry, setDemoInquiry] = useState(false);
  const sampleName = "Tina Rossi";

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
          {sampleName}
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
          {t("dashboard.adminCardStudio2.sampleTalentType")}
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
            {t("dashboard.adminCardStudio2.previewAvailable")}
          </span>
        ) : null}

        {/* Favorite — top-right overlay, matches TalentCardActions circle */}
        {showFavorite ? (
          <button
            type="button"
            aria-pressed={demoFav}
            aria-label={interpolate(
              t(
                demoFav
                  ? "dashboard.adminCardStudio2.previewRemoveFavoriteAria"
                  : "dashboard.adminCardStudio2.previewSaveFavoriteAria",
              ),
              { name: sampleName },
            )}
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
            {interpolate(t("dashboard.adminCardStudio2.previewRating"), { rating: "4.9", count: 32 })}
          </div>
        ) : null}

        {appearance.showPriceFrom ? (
          <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, color: COLORS.ink }}>
            {interpolate(t("dashboard.adminCardStudio2.previewPriceFrom"), { price: "€850" })}
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
              {t("dashboard.adminCardStudio2.previewVerified")}
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
            {t(
              demoInquiry
                ? "dashboard.adminCardStudio2.previewAdded"
                : "dashboard.adminCardStudio2.previewInquire",
            )}
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
            {t("dashboard.adminCardStudio2.previewNoClientActions")}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Visual design — kit chooser + color knobs + LIVE canonical-card preview.
//
// This is the REAL persistence half of the studio (the folded-in P2.2 visual
// studio): a kit / color edit writes the card-family tokens
// (template.directory-card-family + card.surface / card.name-color /
// card.muted) into the agency design draft via the design actions, and one
// Publish promotes the draft live so every <TalentCard> repaints with zero
// per-card edits.
// ────────────────────────────────────────────────────────────────────────

/** A talent-card kit (a named subset of card-family tokens). */
export type CardKitOption = {
  slug: string;
  label: string;
  description: string;
  tokens: Record<string, string>;
};

// Token-key constants live in the import-free ./card-design-token-keys module
// (this file re-exports them for its existing consumers). Do NOT define keys
// here and import them from there — that exact shape was a module cycle that
// crashed the whole admin shell on production at chunk-evaluation time.
export {
  CARD_DESIGN_TOKEN_KEYS,
  CARD_FAMILY_TOKEN_KEY,
} from "./card-design-token-keys";

/** The color knobs the studio exposes, in display order. */
// English `label` / `hint` remain the non-UI fallback; the studio renders
// `t(knob.labelKey)` / `t(knob.hintKey)`. Key strings must stay in sync with
// CARD_COLOR_KNOB_KEYS in ./card-design-token-keys (pinned by test).
const KNOB_NS = "dashboard.adminCardStudio2.knobs";

export const CARD_COLOR_KNOBS: Array<{
  key: string; label: string; hint: string; labelKey: string; hintKey: string;
}> = [
  { key: "card.surface", label: "Card surface", hint: "Media / panel ground",
    labelKey: `${KNOB_NS}.surfaceLabel`, hintKey: `${KNOB_NS}.surfaceHint` },
  { key: "card.name-color", label: "Name color", hint: "Talent name",
    labelKey: `${KNOB_NS}.nameLabel`, hintKey: `${KNOB_NS}.nameHint` },
  { key: "card.muted", label: "Secondary text", hint: "Type · location · availability",
    labelKey: `${KNOB_NS}.mutedLabel`, hintKey: `${KNOB_NS}.mutedHint` },
  { key: "card.price-color", label: "Price chip", hint: "The “From $X” chip",
    labelKey: `${KNOB_NS}.priceLabel`, hintKey: `${KNOB_NS}.priceHint` },
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

// ────────────────────────────────────────────────────────────────────────
// Kit swatch — private helper, not exported
// ────────────────────────────────────────────────────────────────────────

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

// ────────────────────────────────────────────────────────────────────────
// CardKitChooser
// ────────────────────────────────────────────────────────────────────────

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
  const t = useT();
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
                  {t(
                    busy
                      ? "dashboard.adminCardStudio2.kitApplying"
                      : "dashboard.adminCardStudio2.kitActive",
                  )}
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

// ────────────────────────────────────────────────────────────────────────
// ColorKnob
// ────────────────────────────────────────────────────────────────────────

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
  const t = useT();
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
          {hasValue
            ? hint
            : interpolate(t("dashboard.adminCardStudio2.knobInheritsTheme"), { hint })}
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
            {t("dashboard.adminCardStudio2.clear")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// DesignSaveStatus
// ────────────────────────────────────────────────────────────────────────

/** Explicit, persistent draft-save status. Never a toast-and-vanish. */
export function DesignSaveStatus({ state }: { state: DesignSaveState }) {
  const t = useT();
  if (state.kind === "idle") return null;
  let label: string;
  let color: string;
  let bg: string;
  if (state.kind === "saving") {
    label = t("dashboard.adminCardStudio2.savingDraft");
    color = COLORS.inkMuted;
    bg = COLORS.surfaceAlt;
  } else if (state.kind === "saved") {
    label = interpolate(t("dashboard.adminCardStudio2.draftSavedVersion"), {
      version: state.version,
    });
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

// ────────────────────────────────────────────────────────────────────────
// Section-level compounds + roster preview live in CardDesignStudio-4.tsx
// (a leaf that imports from THIS module) to keep every file under the shell's
// 800-line budget. The -2 barrel re-exports them straight from -4, so the
// dependency graph stays acyclic: -3 (this leaf) ← -4 ← -2 barrel ← studio.
// ────────────────────────────────────────────────────────────────────────
