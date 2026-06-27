"use client";

/**
 * ExpandedChatLayout — the 2-pane shell for the expanded MiniChatPanel (Lane C / F4).
 *
 * Extracted from MiniChatPanel to keep that file under the 800-line hard cap.
 * Renders the fixed-position outer container (matching the mini panel's position
 * anchor) with:
 *   LEFT  (fixed ~232px) — the conversation list (passed as children prop `left`)
 *   RIGHT (flex:1)       — the active thread/composer column (passed as `right`)
 *
 * All dimension tokens come from mini-chat-styles so only ONE place needs updating
 * when sizes change. No gold/rust; all brand accent comes from the host panel.
 *
 * The left-pane header shows a "Conversations" label and the brand avatar; the
 * right pane is a raw flex column that the caller populates with the full panel
 * content (header + body + composer + footer).
 */

import type { ReactNode } from "react";

import {
  FONT,
  expandedShellStyle,
  leftPaneStyle,
  paletteFor,
  rightPaneStyle,
  type SurfaceMode,
} from "./mini-chat-styles";
import type { GuestInquirySummary } from "@/lib/inquiry/guest-chat-contract";
import { createTranslator } from "@/i18n/messages";
import { GuestThreadSwitcher, type GuestThreadSwitcherProps } from "./GuestThreadSwitcher";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export type ExpandedChatLayoutProps = {
  /** The full right-pane column: header + body + composer + footer. */
  right: ReactNode;
  /** Brand accent (tenant color, resolved to DEFAULT_ACCENT upstream). */
  accent: string;
  /** Readable ink on `accent`. */
  accentInk: string;
  /** aria-label for the dialog container. */
  ariaLabel: string;
  // Left pane — GuestThreadSwitcher props forwarded directly.
  inquiries: GuestInquirySummary[];
  activeInquiryId: string | null;
  seenAtByInquiry: Record<string, string>;
  onSelect: GuestThreadSwitcherProps["onSelect"];
  /** Jon 360 Phase 7 — dark surface variant when the tenant theme is noir. */
  surfaceMode?: SurfaceMode;
  /**
   * Phase 5 — guest UI locale (brand.locale), so the project switcher labels +
   * draft/sent pills render in the tenant language. Defaults to "en".
   */
  locale?: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function ExpandedChatLayout({
  right,
  accent,
  accentInk,
  ariaLabel,
  inquiries,
  activeInquiryId,
  seenAtByInquiry,
  onSelect,
  surfaceMode = "light",
  locale,
}: ExpandedChatLayoutProps) {
  const P = paletteFor(surfaceMode);
  const t = createTranslator(locale ?? "en");
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={ariaLabel}
      style={expandedShellStyle(P)}
    >
      {/* Horizontal flex: left list + right thread */}
      <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
        {/* ── Left pane: conversation list ───────────────────────────────── */}
        <div style={leftPaneStyle(P)}>
          {/* Left pane header */}
          <div
            style={{
              padding: "13px 12px 10px",
              borderBottom: `1px solid ${P.borderSoft}`,
              flexShrink: 0,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: P.inkMuted,
                letterSpacing: 0.6,
                textTransform: "uppercase",
                fontFamily: FONT,
              }}
            >
              {t("public.guestChat.switcherPaneTitle")}
            </div>
          </div>

          {/* Conversation list — GuestThreadSwitcher in list layout */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {inquiries.length === 0 ? (
              <div
                style={{
                  padding: "14px 12px",
                  fontSize: 12,
                  color: P.inkDim,
                  fontFamily: FONT,
                }}
              >
                {t("public.guestChat.switcherEmpty")}
              </div>
            ) : (
              <GuestThreadSwitcher
                inquiries={inquiries}
                activeInquiryId={activeInquiryId}
                accent={accent}
                accentInk={accentInk}
                seenAtByInquiry={seenAtByInquiry}
                onSelect={onSelect}
                layout="list"
                surfaceMode={surfaceMode}
                t={t}
              />
            )}
          </div>
        </div>

        {/* ── Right pane: thread + composer ──────────────────────────────── */}
        <div style={rightPaneStyle}>{right}</div>
      </div>
    </div>
  );
}
