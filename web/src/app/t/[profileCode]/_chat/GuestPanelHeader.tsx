"use client";

/**
 * GuestPanelHeader — DOCK v2.2 identity row.
 *
 * v2.1 packed five competing controls into one 44px strip and lost on all
 * three counts the owner called out:
 *
 *   1. The agency logo was painted as `center / cover` into a 32px CIRCLE.
 *      Impronta's logo is a 610x129 WORDMARK, so the circle cropped a 27%
 *      slice out of its middle and the header read "PR(". A wordmark is not
 *      an avatar and must never be cropped to one.
 *   2. The identity carried a bare chevron with no label, so "Impronta v"
 *      gave no clue that tapping it switches inquiry.
 *   3. "Private draft" is product jargon, and a bare sliders icon wearing a
 *      "0/6" badge reads like a score the guest is losing.
 *
 * v2.2 is two lines instead of one crowded row:
 *
 *   [wordmark OR monogram + name]                    [details] [expand] [x]
 *   Not sent yet  v                 <- labelled, and IT is the switcher
 *
 * A tenant with a real logo gets the wordmark AS the identity (no name
 * repeated beside it, no crop); a tenant without one keeps the monogram +
 * name. The second line names the conversation's actual state in plain
 * language and is the only switcher affordance, so nothing is a mystery tap.
 *
 * House rules: tenant accent only, editorial serif for the agency identity,
 * dark-variant-aware via the injected palette, no em dashes.
 */

import { ChevronDown, Lock, Maximize2, Minimize2, SlidersHorizontal, X } from "lucide-react";

import type { Translator } from "@/i18n/interpolate";
import { interpolate } from "@/i18n/interpolate";
import type { MiniChatBrand } from "@/lib/inquiry/guest-chat-contract";
import type { UnifiedSyncState } from "./use-unified-inquiry";
import { FONT, FONT_DISPLAY, type Palette, type SurfaceMode } from "./mini-chat-styles";

/**
 * The three honest states of the header's status line. "not a draft" does NOT
 * imply "sent": a guest who has opened the panel but not started an inquiry has
 * no thread at all, and telling them it is awaiting a reply is a lie.
 */
export type GuestHeaderThreadState = "new" | "draft" | "sent";

export type GuestPanelHeaderProps = {
  brand: MiniChatBrand;
  accent: string;
  accentInk: string;
  talentFirst: string;
  /** The resolved palette for the active surface mode (light/dark). */
  C: Palette;
  surfaceMode?: SurfaceMode;
  /**
   * What the status line reports. "draft" = a private un-sent inquiry exists;
   * "sent" = it has reached the agency; "new" = nothing started yet.
   */
  threadState?: GuestHeaderThreadState;
  /** Panel-level sync state, folded into the status line's accessible name. */
  syncState?: UnifiedSyncState;
  /** Re-run the last failed patch (the status line's error retry). */
  onRetrySync?: () => void;
  /** Toggle the 2-pane expanded layout. */
  onToggleExpand?: () => void;
  /** DOCK v2.1 — open the in-chat thread switcher drawer. */
  onOpenSwitcher?: (() => void) | null;
  /** DOCK v2.1 — the header details control. */
  onOpenDetails?: (() => void) | null;
  detailsFilled?: number;
  detailsTotal?: number;
  /** Whether the panel is currently expanded (label + icon). */
  expanded?: boolean;
  t: Translator;
  onClose: () => void;
};

export function GuestPanelHeader({
  brand,
  accent,
  accentInk,
  talentFirst,
  C,
  threadState = "new",
  syncState = "idle",
  onRetrySync,
  onToggleExpand,
  expanded = false,
  onOpenSwitcher = null,
  onOpenDetails = null,
  detailsFilled = 0,
  detailsTotal = 6,
  t,
  onClose,
}: GuestPanelHeaderProps) {
  const showStatusLine = threadState !== "new" || Boolean(onOpenSwitcher);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "10px 12px 10px 14px",
        borderBottom: `1px solid ${C.borderSoft}`,
        background: C.surfaceFaint,
        flexShrink: 0,
      }}
    >
      <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
        <BrandIdentity
          brand={brand}
          accent={accent}
          accentInk={accentInk}
          talentFirst={talentFirst}
          C={C}
        />
        {showStatusLine && (
          <StatusLine
            threadState={threadState}
            syncState={syncState}
            onRetrySync={onRetrySync}
            onOpenSwitcher={onOpenSwitcher}
            C={C}
            t={t}
          />
        )}
      </div>

      {onOpenDetails && (
        // Event-details CTA. v2.1 shipped a bare sliders glyph with a "0/6"
        // badge; unlabelled progress toward an unnamed goal reads as a score,
        // not an invitation. It is a labelled chip now, and the count appears
        // only once there is progress worth reporting.
        <DetailsChip
          onOpenDetails={onOpenDetails}
          filled={detailsFilled}
          total={detailsTotal}
          accent={accent}
          accentInk={accentInk}
          C={C}
          t={t}
        />
      )}

      {onToggleExpand && (
        // v2.1 hid this single action behind a "..." overflow menu. A menu
        // holding exactly one item is pure indirection, so it is a direct
        // toggle now.
        <button
          type="button"
          onClick={onToggleExpand}
          aria-label={
            expanded
              ? t("public.guestChat.menuCollapse")
              : t("public.guestChat.menuExpand")
          }
          title={
            expanded
              ? t("public.guestChat.menuCollapse")
              : t("public.guestChat.menuExpand")
          }
          style={iconBtnStyle(C)}
        >
          {expanded ? (
            <Minimize2 size={16} strokeWidth={2.2} aria-hidden />
          ) : (
            <Maximize2 size={16} strokeWidth={2.2} aria-hidden />
          )}
        </button>
      )}

      <button
        type="button"
        onClick={onClose}
        aria-label={t("public.guestChat.closeAria")}
        style={iconBtnStyle(C)}
      >
        <X size={17} strokeWidth={2.2} aria-hidden />
      </button>
    </div>
  );
}

/**
 * BrandIdentity — the agency's mark.
 *
 * With a logo the image IS the identity: rendered at its natural aspect ratio
 * (height-capped, `object-fit: contain`), never cropped into a circle, and
 * never paired with the agency name repeated in text beside it. Without one we
 * fall back to the accent monogram + the name in the editorial serif.
 */
function BrandIdentity({
  brand,
  accent,
  accentInk,
  talentFirst,
  C,
}: {
  brand: MiniChatBrand;
  accent: string;
  accentInk: string;
  talentFirst: string;
  C: Palette;
}) {
  if (brand.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={brand.logoUrl}
        alt={brand.agencyName}
        style={{
          height: 22,
          width: "auto",
          maxWidth: "min(190px, 100%)",
          objectFit: "contain",
          objectPosition: "left center",
          display: "block",
        }}
      />
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
      <span
        aria-hidden
        style={{
          width: 24,
          height: 24,
          borderRadius: "50%",
          flexShrink: 0,
          background: accent,
          color: accentInk,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 700,
          fontFamily: FONT,
        }}
      >
        {talentFirst[0]?.toUpperCase() ?? "•"}
      </span>
      <span
        style={{
          minWidth: 0,
          fontFamily: FONT_DISPLAY,
          fontSize: 15,
          fontWeight: 600,
          letterSpacing: 0.1,
          color: C.ink,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {brand.agencyName}
      </span>
    </div>
  );
}

/**
 * StatusLine — the second header line. It names the conversation's real state
 * in plain language ("Not sent yet") and, when thread switching is available,
 * IS the switcher: a labelled control with a chevron, so the affordance is
 * never a naked chevron hanging off the brand name.
 */
function StatusLine({
  threadState,
  syncState,
  onRetrySync,
  onOpenSwitcher,
  C,
  t,
}: {
  threadState: GuestHeaderThreadState;
  syncState: UnifiedSyncState;
  onRetrySync?: () => void;
  onOpenSwitcher: (() => void) | null;
  C: Palette;
  t: Translator;
}) {
  const isDraft = threadState === "draft";
  const isError = isDraft && syncState === "error";
  const state =
    threadState === "draft"
      ? t("public.guestChat.headerDraftLine")
      : threadState === "sent"
        ? t("public.guestChat.headerSentLine")
        : t("public.guestChat.headerNewLine");

  // The full reassurance the old chip carried in its accessible name is kept,
  // plus the save-state tail, so nothing is lost by shortening the visible text.
  const tail = !isDraft
    ? null
    : syncState === "saving"
      ? t("public.guestChat.draftSaving")
      : syncState === "saved"
        ? t("public.guestChat.draftSaved")
        : isError
          ? t("public.guestChat.draftSaveError")
          : null;
  const meaning =
    threadState === "draft"
      ? t("public.guestChat.headerDraftLineFull")
      : threadState === "sent"
        ? t("public.guestChat.headerSentLine")
        : t("public.guestChat.headerNewLine");
  const fullText = `${meaning}${tail ? ` ${tail}` : ""}`;

  const color = isError ? C.danger : C.inkMuted;
  const body = (
    <>
      {isDraft && (
        <Lock size={10} strokeWidth={2.4} aria-hidden style={{ flexShrink: 0 }} />
      )}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {state}
      </span>
    </>
  );

  const textStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    minWidth: 0,
    maxWidth: "100%",
    padding: 0,
    border: "none",
    background: "transparent",
    color,
    fontFamily: FONT,
    fontSize: 11.5,
    fontWeight: 500,
    lineHeight: 1.2,
    textAlign: "left",
  } as const;

  // Save failed: the line becomes the retry control and says so, which beats a
  // silent chip the guest has no reason to tap.
  if (isError && onRetrySync) {
    return (
      <button type="button" onClick={onRetrySync} aria-label={fullText} title={fullText} style={{ ...textStyle, cursor: "pointer" }}>
        {body}
      </button>
    );
  }

  if (!onOpenSwitcher) {
    return (
      <span title={fullText} style={textStyle}>
        {body}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpenSwitcher}
      aria-haspopup="dialog"
      aria-label={interpolate(t("public.guestChat.headerSwitchAria"), { state: fullText })}
      title={fullText}
      style={{ ...textStyle, cursor: "pointer" }}
    >
      {body}
      <ChevronDown size={13} strokeWidth={2.4} aria-hidden style={{ flexShrink: 0 }} />
    </button>
  );
}

/** DetailsChip — labelled entry to the event-details sheet. */
function DetailsChip({
  onOpenDetails,
  filled,
  total,
  accent,
  accentInk,
  C,
  t,
}: {
  onOpenDetails: () => void;
  filled: number;
  total: number;
  accent: string;
  accentInk: string;
  C: Palette;
  t: Translator;
}) {
  const started = total > 0 && filled > 0;
  const label = started
    ? interpolate(t("public.guestChat.detailsChipProgress"), {
        filled: String(filled),
        total: String(total),
      })
    : t("public.guestChat.detailsChipAdd");

  return (
    <button
      type="button"
      onClick={onOpenDetails}
      aria-haspopup="dialog"
      aria-label={t("public.guestChat.detailsHeaderAria")}
      title={t("public.guestChat.detailsHeaderAria")}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        flexShrink: 0,
        height: 26,
        padding: "0 9px",
        borderRadius: 999,
        border: `1px solid ${started ? "transparent" : C.border}`,
        background: started ? accent : "transparent",
        color: started ? accentInk : C.inkMuted,
        cursor: "pointer",
        fontFamily: FONT,
        fontSize: 11,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      <SlidersHorizontal size={13} strokeWidth={2.2} aria-hidden />
      {label}
    </button>
  );
}

function iconBtnStyle(C: Palette) {
  return {
    width: 28,
    height: 28,
    borderRadius: 8,
    border: "none",
    background: "transparent",
    color: C.inkMuted,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    fontFamily: FONT,
  } as const;
}
