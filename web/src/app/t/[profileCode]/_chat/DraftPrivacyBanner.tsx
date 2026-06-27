"use client";

/**
 * DraftPrivacyBanner — the "this is a private draft" frame for the unified inquiry
 * chat (Jon Inquiry 360, Phase 1: make the DRAFT -> SENT boundary FELT).
 *
 * Shown ONLY while the inquiry behind the panel is a private draft: an inquiry row
 * exists (the early-partial row useUnifiedInquiry lazily created) AND its contact
 * is NOT yet promoted (still the synthetic seed). In that window nothing has gone
 * to the agency yet, so the guest is reassured that their edits are private and
 * saved, and that sending is a deliberate, separate step.
 *
 * It SUBSUMES SyncStatusBar: the three save states fold into the sub-line so the
 * guest never has to track two status surfaces. The hook's panel-level syncState
 * drives it:
 *   • saving -> small spinner + "Saving..."
 *   • saved  -> a brief check, then it settles back to the resting privacy sub-line.
 *   • error  -> danger treatment + "Could not save your last change. Tap to retry."
 *              (clickable; re-runs the last failed patch via onRetry).
 *   • idle   -> the resting privacy sub-line.
 *
 * House rules: tenant accent only (the resting state is neutral; no hardcoded
 * gold), no em dashes, inline styles only, reduced-motion-safe (the spinner stops
 * under prefers-reduced-motion). The save-state text is aria-live="polite". Copy
 * is localized via the injected `t`.
 */

import type { CSSProperties } from "react";

import { Check, Lock } from "lucide-react";

import type { Translator } from "@/i18n/interpolate";
import { interpolate } from "@/i18n/interpolate";
import type { UnifiedSyncState } from "./use-unified-inquiry";
import { FONT, paletteFor, type Palette, type SurfaceMode } from "./mini-chat-styles";

export type DraftPrivacyBannerProps = {
  /** Agency display name (interpolated into the resting sub-line). */
  agencyName: string;
  /** Panel-level sync state from useUnifiedInquiry.syncState. */
  syncState: UnifiedSyncState;
  /** Guest-locale translator (resolved from brand.locale). */
  t: Translator;
  /** Re-run the last failed patch (the error state's retry action). */
  onRetry?: () => void;
  /** Jon 360 Phase 7 — dark surface variant for noir tenants. Default "light". */
  surfaceMode?: SurfaceMode;
};

const wrapStyle = (C: Palette): CSSProperties => ({
  display: "flex",
  alignItems: "flex-start",
  gap: 9,
  padding: "9px 14px",
  borderBottom: `1px solid ${C.borderSoft}`,
  background: C.surfaceFaint,
  fontFamily: FONT,
  flexShrink: 0,
});

export function DraftPrivacyBanner({
  agencyName,
  syncState,
  t,
  onRetry,
  surfaceMode = "light",
}: DraftPrivacyBannerProps) {
  const C = paletteFor(surfaceMode);
  return (
    <div style={wrapStyle(C)}>
      <Lock
        size={14}
        strokeWidth={2.2}
        aria-hidden
        style={{ color: C.inkMuted, flexShrink: 0, marginTop: 2 }}
      />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 700,
            color: C.ink,
            lineHeight: 1.35,
          }}
        >
          {t("public.guestChat.draftTitle")}
        </div>
        <SaveStateLine
          agencyName={agencyName}
          syncState={syncState}
          t={t}
          onRetry={onRetry}
          C={C}
        />
      </div>
    </div>
  );
}

/**
 * The sub-line folds in the three save states; at rest it shows the privacy
 * reassurance. aria-live="polite" so the save transitions are announced without
 * stealing focus.
 */
function SaveStateLine({
  agencyName,
  syncState,
  t,
  onRetry,
  C,
}: {
  agencyName: string;
  syncState: UnifiedSyncState;
  t: Translator;
  onRetry?: () => void;
  C: Palette;
}) {
  const baseStyle: CSSProperties = {
    marginTop: 2,
    fontSize: 11.5,
    fontWeight: 500,
    lineHeight: 1.4,
    display: "flex",
    alignItems: "center",
    gap: 6,
  };

  if (syncState === "error") {
    return (
      <div role="status" aria-live="polite" style={baseStyle}>
        <button
          type="button"
          onClick={onRetry}
          // C.danger clears 4.5:1 on the faint surface; clickable retry.
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "none",
            border: "none",
            padding: 0,
            margin: 0,
            textAlign: "left",
            cursor: onRetry ? "pointer" : "default",
            fontFamily: FONT,
            fontSize: 11.5,
            fontWeight: 600,
            color: C.danger,
            textDecorationLine: "underline",
            textUnderlineOffset: 2,
          }}
        >
          {t("public.guestChat.draftSaveError")}
        </button>
      </div>
    );
  }

  if (syncState === "saving") {
    return (
      <div role="status" aria-live="polite" style={{ ...baseStyle, color: C.inkDim }}>
        <Spinner C={C} />
        <span>{t("public.guestChat.draftSaving")}</span>
      </div>
    );
  }

  if (syncState === "saved") {
    return (
      <div role="status" aria-live="polite" style={{ ...baseStyle, color: C.inkMuted }}>
        <Check size={12} strokeWidth={2.4} aria-hidden />
        <span>{t("public.guestChat.draftSaved")}</span>
      </div>
    );
  }

  // idle — the resting privacy reassurance.
  return (
    <div role="status" aria-live="polite" style={{ ...baseStyle, color: C.inkMuted }}>
      <span>
        {interpolate(t("public.guestChat.draftSubline"), { agency: agencyName })}
      </span>
    </div>
  );
}

function Spinner({ C }: { C: Palette }) {
  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html:
            "@keyframes uic-draft-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}" +
            ".uic-draft-spinner{animation:uic-draft-spin 0.7s linear infinite}" +
            "@media (prefers-reduced-motion: reduce){.uic-draft-spinner{animation:none}}",
        }}
      />
      <span
        aria-hidden
        className="uic-draft-spinner"
        style={{
          width: 12,
          height: 12,
          borderRadius: "50%",
          border: `1.5px solid ${C.border}`,
          borderTopColor: C.inkMuted,
          display: "inline-block",
          flexShrink: 0,
        }}
      />
    </>
  );
}
