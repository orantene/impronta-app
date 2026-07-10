"use client";

/**
 * GuestPanelHeader — the agency-identity header row of the guest mini-chat
 * (avatar/logo medallion + agency name + humanized subtitle + close button).
 *
 * Extracted verbatim from MiniChatPanelColumn.tsx to keep that file under the
 * 800-line hard cap (the column reached the budget once the Jon 360 conversation
 * strip was added). Behavior is byte-for-byte the same as the inline block it
 * replaced; only the surrounding `<>` and the import wiring moved.
 *
 * Subtitle is TIERED BY TRUTH (Jon 360 Phase 2): once the inquiry is SENT the
 * ReceiptCoordinatorHeader names the coordinator (or says one is being assigned);
 * pre-send it shows the typical-reply / leave-a-message hint. House rules: tenant
 * accent only, no em dashes, dark-variant-aware via the injected palette.
 */

import { Lock } from "lucide-react";

import type { Translator } from "@/i18n/interpolate";
import { interpolate } from "@/i18n/interpolate";
import type {
  GuestThreadStatus,
  InquiryReceiptData,
  MiniChatBrand,
} from "@/lib/inquiry/guest-chat-contract";
import type { UnifiedSyncState } from "./use-unified-inquiry";
import { ReceiptCoordinatorHeader } from "./ReceiptCoordinatorHeader";
import {
  FONT,
  FONT_DISPLAY,
  statusCopy,
  type Palette,
  type SurfaceMode,
} from "./mini-chat-styles";

export type GuestPanelHeaderProps = {
  brand: MiniChatBrand;
  accent: string;
  accentInk: string;
  talentFirst: string;
  /** The resolved palette for the active surface mode (light/dark). */
  C: Palette;
  surfaceMode?: SurfaceMode;
  inquiryId: string | null;
  threadStatus: GuestThreadStatus;
  typicalReply: string | null;
  receipt?: InquiryReceiptData | null;
  /**
   * Wave 1 (W1-B): the inquiry is a private, un-sent draft. The old full-band
   * DraftPrivacyBanner is subsumed into a single-line lock chip in the header, so
   * the compact panel keeps to header / thread / composer bands. Pre-send only.
   */
  isPrivateDraft?: boolean;
  /** Panel-level sync state, folded into the draft lock chip's sub-text. */
  syncState?: UnifiedSyncState;
  /** Re-run the last failed patch (the draft lock chip's error retry). */
  onRetrySync?: () => void;
  t: Translator;
  onClose: () => void;
};

export function GuestPanelHeader({
  brand,
  accent,
  accentInk,
  talentFirst,
  C,
  surfaceMode = "light",
  inquiryId,
  threadStatus,
  typicalReply,
  receipt = null,
  isPrivateDraft = false,
  syncState = "idle",
  onRetrySync,
  t,
  onClose,
}: GuestPanelHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 11,
        padding: "13px 14px",
        borderBottom: `1px solid ${C.borderSoft}`,
        background: C.surfaceFaint,
        flexShrink: 0,
      }}
    >
      <div
        aria-hidden
        style={{
          width: 38,
          height: 38,
          borderRadius: "50%",
          flexShrink: 0,
          background: brand.logoUrl
            ? `center / cover no-repeat url(${brand.logoUrl})`
            : accent,
          color: accentInk,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 15,
          fontWeight: 700,
          letterSpacing: 0.2,
        }}
      >
        {!brand.logoUrl && (talentFirst[0]?.toUpperCase() ?? "•")}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            // Jon 360 Phase 7 — the agency IDENTITY gets the editorial serif
            // (display axis). Body copy below stays system-sans.
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
        </div>
        {/* Jon 360 Phase 2: once the inquiry is SENT, humanize the subtitle —
            name the coordinator (+ face) or say a coordinator is being assigned,
            never a flat status word or a fake "online". Pre-send keeps the
            greeting/typical-reply hint. */}
        {receipt ? (
          <ReceiptCoordinatorHeader
            receipt={receipt}
            agencyName={brand.agencyName}
            accent={accent}
            t={t}
            surfaceMode={surfaceMode}
          />
        ) : isPrivateDraft ? (
          <DraftLockLine
            syncState={syncState}
            onRetry={onRetrySync}
            C={C}
            t={t}
          />
        ) : (
          <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 1 }}>
            {inquiryId
              ? statusCopy(threadStatus, t)
              : typicalReply
                ? interpolate(t("public.guestChat.typicallyReplies"), { when: typicalReply })
                : t("public.guestChat.leaveMessage")}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={t("public.guestChat.closeAria")}
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          border: "none",
          background: "transparent",
          color: C.inkMuted,
          cursor: "pointer",
          fontSize: 19,
          lineHeight: 1,
          flexShrink: 0,
          fontFamily: FONT,
        }}
      >
        ×
      </button>
    </div>
  );
}

/**
 * DraftLockLine — the one-line "private draft" indicator that replaced the old
 * full-height DraftPrivacyBanner band (Wave 1). Lock glyph + "Private draft" +
 * a save-state tail (Saving.../Saved/retry) folded onto the header subtitle, so
 * the compact panel never stacks a whole band for it.
 */
function DraftLockLine({
  syncState,
  onRetry,
  C,
  t,
}: {
  syncState: UnifiedSyncState;
  onRetry?: () => void;
  C: Palette;
  t: Translator;
}) {
  const tail =
    syncState === "saving"
      ? t("public.guestChat.draftSaving")
      : syncState === "saved"
        ? t("public.guestChat.draftSaved")
        : null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        marginTop: 2,
        fontSize: 11,
        color: C.inkMuted,
        fontFamily: FONT,
        minWidth: 0,
      }}
    >
      <Lock size={11} strokeWidth={2.2} aria-hidden style={{ flexShrink: 0 }} />
      <span style={{ fontWeight: 600, color: C.ink }}>
        {t("public.guestChat.draftLockLabel")}
      </span>
      {syncState === "error" ? (
        <button
          type="button"
          onClick={onRetry}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            margin: 0,
            fontFamily: FONT,
            fontSize: 11,
            fontWeight: 600,
            color: C.danger,
            cursor: onRetry ? "pointer" : "default",
            textDecorationLine: "underline",
            textUnderlineOffset: 2,
          }}
        >
          {t("public.guestChat.draftSaveError")}
        </button>
      ) : tail ? (
        <span aria-live="polite" style={{ color: C.inkDim, whiteSpace: "nowrap" }}>
          {"· "}
          {tail}
        </span>
      ) : null}
    </div>
  );
}
