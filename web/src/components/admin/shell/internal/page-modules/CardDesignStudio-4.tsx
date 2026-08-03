"use client";

/**
 * Card Design studio — section-level compounds + roster preview.
 *
 * Split out of `CardDesignStudio-3.tsx` to keep every page-module file under the
 * shell's 800-line budget. This is a LEAF that imports the foundational
 * vocabulary + atoms from `-3` (never the reverse), so the dependency graph
 * stays acyclic: `-3` (leaf) ← `-4` (this) ← `-2` (barrel) ← main studio.
 *
 * Admin chrome stays neutral / cool — the ONLY place gold appears is inside the
 * right-hand <TalentCard> live preview (CardLivePreview), which is the public
 * editorial card painting from its own published tokens.
 */

import { Check, Eye } from "lucide-react";

import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { COLORS, FONTS, RADIUS, TRANSITION } from "../state";
import type { RosterCardBadgePrefs } from "@/lib/talent-cards/roster-card-badges";
import { TalentCard } from "@/components/talent-cards/TalentCard";

import {
  CARD_COLOR_KNOBS,
  CARD_PREVIEW_SAMPLE,
  CardKitChooser,
  ColorKnob,
  DesignSaveStatus,
  GroupHeader,
  PreviewCard,
  SURFACE_ORDER,
  SURFACE_RULES,
  isHex,
} from "./CardDesignStudio-3";
import type {
  CardAppearance,
  CardKitOption,
  CardSurface,
  DesignPublishState,
  DesignSaveState,
} from "./CardDesignStudio-3";

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
  const t = useT();
  const publishing = publishState.kind === "publishing";
  let line: string;
  if (publishState.kind === "error") {
    line = publishState.message;
  } else if (publishState.kind === "published") {
    line = interpolate(t("dashboard.adminCardStudio2.publishedVersionLive"), {
      version: publishState.version,
    });
  } else if (!canPublish) {
    line = t("dashboard.adminCardStudio2.publishNeedsAccess");
  } else if (dirty) {
    line = t("dashboard.adminCardStudio2.unpublishedChanges");
  } else if (publishedAt) {
    line = interpolate(t("dashboard.adminCardStudio2.liveLastPublished"), {
      date: fmtPublishDate(publishedAt),
    });
  } else {
    line = t("dashboard.adminCardStudio2.nothingPublishedYet");
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
        {t(
          publishing
            ? "dashboard.adminCardStudio2.publishing"
            : "dashboard.adminCardStudio2.publish",
        )}
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

// ────────────────────────────────────────────────────────────────────────
// CardLivePreview
// ────────────────────────────────────────────────────────────────────────

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
    ...(isHex(draft["card.price-color"] ?? "")
      ? { ["--token-card-price-color" as string]: draft["card.price-color"] }
      : {}),
  };

  // Family attr on the preview wrapper (paired with data-card-design-scope so
  // the :is(html, [data-card-design-scope]) family CSS matches) — the preview
  // now shows the kit's chrome, not just its colors.
  const family = draft["template.directory-card-family"] || undefined;

  return (
    <div
      data-token-template-directory-card-family={family}
      data-card-design-scope=""
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

// ────────────────────────────────────────────────────────────────────────
// DesignLookSection — the "Look" card in the left controls column.
// Extracted from CardDesignStudio.tsx to keep that file under 800 lines.
// ────────────────────────────────────────────────────────────────────────

/** The "Look" section — kit chooser + color knobs + draft-save status. */
export function DesignLookSection({
  designReady,
  designLoadError,
  cardKits,
  activeFamily,
  pendingKit,
  canEdit,
  onApply,
  draftTokens,
  onKnobChange,
  saveState,
}: {
  designReady: boolean;
  designLoadError: string | null;
  cardKits: CardKitOption[];
  activeFamily: string;
  pendingKit: string | null;
  canEdit: boolean;
  onApply: (kit: CardKitOption) => void;
  draftTokens: Record<string, string>;
  onKnobChange: (key: string, value: string) => void;
  saveState: DesignSaveState;
}) {
  const t = useT();
  return (
    <section
      style={{
        background: COLORS.card,
        border: `1px solid ${COLORS.border}`,
        borderRadius: RADIUS.lg,
        padding: 16,
      }}
    >
      <GroupHeader
        title={t("dashboard.adminCardStudio2.lookTitle")}
        hint={t("dashboard.adminCardStudio2.lookHint")}
      />
      {!designReady ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 0", fontSize: 13, color: COLORS.inkMuted }}>
          <span
            style={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              border: `2px solid ${COLORS.borderStrong}`,
              borderTopColor: COLORS.accent,
              animation: "tulala-spin 0.7s linear infinite",
            }}
          />
          {t("dashboard.adminCardStudio2.loadingCardDesign")}
          <style>{`@keyframes tulala-spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : designLoadError ? (
        <div style={{ fontSize: 13, color: COLORS.critical, padding: "8px 0" }}>
          {interpolate(t("dashboard.adminCardStudio2.couldNotLoadCardDesign"), {
            error: designLoadError,
          })}
        </div>
      ) : (
        <>
          <CardKitChooser
            kits={cardKits}
            activeSlug={activeFamily}
            pendingSlug={pendingKit}
            canEdit={canEdit}
            onApply={onApply}
          />
          <div style={{ height: 1, background: COLORS.borderSoft, margin: "16px 0 4px" }} />
          <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.inkMuted, marginBottom: 2 }}>
            {t("dashboard.adminCardStudio2.colorsTitle")}
          </div>
          <div style={{ fontSize: 11.5, color: COLORS.inkDim, marginBottom: 6, lineHeight: 1.4 }}>
            {t("dashboard.adminCardStudio2.colorsHint")}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {CARD_COLOR_KNOBS.map((knob) => (
              <ColorKnob
                key={knob.key}
                label={t(knob.labelKey)}
                hint={t(knob.hintKey)}
                value={draftTokens[knob.key] ?? ""}
                disabled={!canEdit}
                onChange={(v) => onKnobChange(knob.key, v)}
                onClear={() => onKnobChange(knob.key, "")}
              />
            ))}
          </div>
          <DesignSaveStatus state={saveState} />
        </>
      )}
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────
// CardDesignPreviewColumn — sticky right preview column.
// ────────────────────────────────────────────────────────────────────────

/** Sticky right preview column — live canonical card + per-surface action preview. */
export function CardDesignPreviewColumn({
  surfaceLabel,
  isRoster,
  rosterCardBadges,
  draftTokens,
  activeSurface,
  appearance,
  favoriteIcon,
  fieldChips,
}: {
  surfaceLabel: string;
  isRoster: boolean;
  rosterCardBadges: RosterCardBadgePrefs;
  draftTokens: Record<string, string>;
  activeSurface: CardSurface;
  appearance: CardAppearance;
  favoriteIcon: "heart" | "bookmark";
  fieldChips: string[];
}) {
  const t = useT();
  return (
    <div style={{ position: "sticky", top: 12, display: "flex", flexDirection: "column", gap: 12, alignItems: "stretch", minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: COLORS.inkMuted }}>
        {interpolate(t("dashboard.adminCardStudio2.surfacePreview"), { surface: surfaceLabel })}
      </div>
      {isRoster ? (
        <>
          <div style={{ alignSelf: "center" }}>
            <RosterBadgePreviewCard badges={rosterCardBadges} />
          </div>
          <div style={{ fontSize: 11, color: COLORS.inkDim, textAlign: "center", maxWidth: 260, lineHeight: 1.45, alignSelf: "center" }}>
            {t("dashboard.adminCardStudio2.rosterPreviewHint")}
          </div>
        </>
      ) : (
        <>
          <CardLivePreview draft={draftTokens} />
          <div style={{ fontSize: 11, color: COLORS.inkDim, lineHeight: 1.45 }}>
            {t("dashboard.adminCardStudio2.livePreviewHint")}
          </div>
          <div style={{ height: 1, background: COLORS.borderSoft, margin: "2px 0" }} />
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: COLORS.inkMuted }}>
            {t("dashboard.adminCardStudio.actionsTitle")}
          </div>
          <div style={{ alignSelf: "center" }}>
            <PreviewCard
              surface={activeSurface}
              appearance={appearance}
              favoriteIcon={favoriteIcon}
              fieldChips={fieldChips}
            />
          </div>
          <div style={{ fontSize: 11, color: COLORS.inkDim, lineHeight: 1.45 }}>
            {t("dashboard.adminCardStudio2.actionsPreviewHint")}
          </div>
        </>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// RosterBadgePreviewCard — faithful replica of a real RosterCard's overlay
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
  const t = useT();
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
              title={t("dashboard.adminCardStudio2.rosterVisibilityEyeTitle")}
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
              {t("dashboard.adminCardStudio2.rosterDiscoverBadge")}
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
              title={t("dashboard.adminCardStudio2.rosterTulalaVerifiedTitle")}
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
              {t("dashboard.adminCardStudio2.rosterAvailableBadge")}
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
          {"Tina Rossi"}
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
          {t("dashboard.adminCardStudio2.sampleTalentType")}
        </div>
        <div style={{ fontSize: 11, marginTop: 1, color: COLORS.inkMuted }}>📍 Milano, IT</div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// CardSurfaceTabStrip — surface tab bar + rationale line.
// Extracted from CardDesignStudio.tsx to keep that file under 800 lines.
// ────────────────────────────────────────────────────────────────────────

/** Surface tab bar + rationale note line below it. */
export function CardSurfaceTabStrip({
  activeSurface,
  onSurfaceChange,
}: {
  activeSurface: CardSurface;
  onSurfaceChange: (s: CardSurface) => void;
}) {
  const t = useT();
  const rule = SURFACE_RULES[activeSurface];
  return (
    <>
      <div
        role="tablist"
        aria-label={t("dashboard.adminCardStudio2.cardSurfaceTablistAria")}
        style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}
      >
        {SURFACE_ORDER.map((s) => {
          const r = SURFACE_RULES[s];
          const active = s === activeSurface;
          return (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSurfaceChange(s)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "8px 14px",
                borderRadius: RADIUS.md,
                border: `1px solid ${active ? COLORS.ink : COLORS.border}`,
                background: active ? COLORS.card : "transparent",
                boxShadow: active ? COLORS.shadow : "none",
                cursor: "pointer",
                fontFamily: FONTS.body,
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                color: active ? COLORS.ink : COLORS.inkMuted,
                transition: `color ${TRANSITION.sm}, border-color ${TRANSITION.sm}`,
              }}
            >
              {t(r.labelKey)}
              <span
                style={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  color: r.favorite || r.inquiry ? COLORS.accentDeep : COLORS.inkDim,
                  background: r.favorite || r.inquiry ? COLORS.accentSoft : COLORS.surfaceAlt,
                  borderRadius: 999,
                  padding: "2px 6px",
                }}
              >
                {t(r.tagKey)}
              </span>
            </button>
          );
        })}
      </div>
      <div
        style={{
          fontSize: 12.5,
          color: COLORS.inkMuted,
          lineHeight: 1.5,
          padding: "10px 12px",
          background: COLORS.surfaceAlt,
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: RADIUS.md,
        }}
      >
        {t(rule.noteKey)}
      </div>
    </>
  );
}
