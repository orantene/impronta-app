"use client";

/**
 * SyncStatusBar — the panel-level sync indicator for the unified inquiry record
 * (Message Impronta plan §4 C.13 / B.4 / finding #3).
 *
 * The unified hook already computes a panel-level `syncState` ("idle" | "saving"
 * | "saved" | "error"), but nothing surfaced it, so a failed Talent / Brief /
 * Contact write had no visible home — the rail editors close on submit and the
 * failure was silently swallowed. This sticky 28px bar makes saves visible:
 *
 *   • idle  → renders nothing (clean).
 *   • saving → "Saving..." with a small spinner (C.inkDim).
 *   • saved  → "Saved" with a check (C.inkMuted; the parent auto-hides via the
 *              hook's saved auto-hide, which flips back to idle).
 *   • error  → "Couldn't save, tap to retry." (C.danger) — clickable; the parent
 *              re-runs the last failed patch.
 *
 * House rules: tenant accent only (none needed here — neutral status colors),
 * no em dashes, no hardcoded gold, inline styles only. Copy is localized via the
 * injected `t`.
 */

import type { CSSProperties } from "react";

import { Check } from "lucide-react";

import type { Translator } from "@/i18n/interpolate";
import type { UnifiedSyncState } from "./use-unified-inquiry";
import { C, FONT } from "./mini-chat-styles";

export type SyncStatusBarProps = {
  /** Panel-level sync state from useUnifiedInquiry.syncState. */
  state: UnifiedSyncState;
  /** Guest-locale translator (resolved from brand.locale). */
  t: Translator;
  /** Re-run the last failed patch (shown only in the error state). */
  onRetry?: () => void;
};

const barStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  minHeight: 28,
  padding: "5px 14px",
  borderTop: `1px solid ${C.borderSoft}`,
  background: C.surfaceFaint,
  fontFamily: FONT,
  fontSize: 11.5,
  fontWeight: 500,
};

export function SyncStatusBar({ state, t, onRetry }: SyncStatusBarProps) {
  if (state === "idle") return null;

  if (state === "error") {
    return (
      <div role="status" aria-live="polite" style={barStyle}>
        <button
          type="button"
          onClick={onRetry}
          // C.danger clears 4.5:1 on the faint surface; clickable retry per B.4.
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "none",
            border: "none",
            padding: 0,
            margin: 0,
            cursor: onRetry ? "pointer" : "default",
            fontFamily: FONT,
            fontSize: 11.5,
            fontWeight: 600,
            color: C.danger,
            textDecorationLine: "underline",
            textUnderlineOffset: 2,
          }}
        >
          {t("public.guestChat.syncRetry")}
        </button>
      </div>
    );
  }

  if (state === "saved") {
    return (
      <div role="status" aria-live="polite" style={{ ...barStyle, color: C.inkMuted }}>
        <Check size={13} strokeWidth={2.4} aria-hidden />
        <span>{t("public.guestChat.syncSaved")}</span>
      </div>
    );
  }

  // saving
  return (
    <div role="status" aria-live="polite" style={{ ...barStyle, color: C.inkDim }}>
      <Spinner />
      <span>{t("public.guestChat.syncSaving")}</span>
    </div>
  );
}

function Spinner() {
  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html:
            "@keyframes uic-sync-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}" +
            ".uic-sync-spinner{animation:uic-sync-spin 0.7s linear infinite}" +
            "@media (prefers-reduced-motion: reduce){.uic-sync-spinner{animation:none}}",
        }}
      />
      <span
        aria-hidden
        className="uic-sync-spinner"
        style={{
          width: 12,
          height: 12,
          borderRadius: "50%",
          border: `1.5px solid ${C.border}`,
          borderTopColor: C.inkMuted,
          display: "inline-block",
        }}
      />
    </>
  );
}
