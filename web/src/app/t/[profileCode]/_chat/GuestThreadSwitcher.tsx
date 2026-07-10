"use client";

/**
 * GuestThreadSwitcher — Phase 5 multi-inquiry PROJECTS switcher.
 *
 * Rendered in the MiniChatPanel header area by the wiring agent ONLY when the
 * guest has 2 or more live conversations (§10 progressive disclosure).
 * Single-thread guests never see this component.
 *
 * Phase 5 reshape: each row is a multi-talent PROJECT, not a single talent. It
 * renders a read-only FACE-STACK of the project's lineup (ReadonlyFaceStack,
 * mirroring the launcher pill) + the projectLabel (job_name or a derived
 * "Lineup of N · Jun 28") and visually distinguishes a private DRAFT from a
 * "Sent · awaiting reply" project via a status pill.
 *
 * Design rules:
 *   • Brand accent drives the active indicator — NO gold/rust.
 *   • Real portraits in the face-stack; accent/cool-surface initials fallback
 *     (house rule: never a gray box).
 *   • 'new' dot appears when lastMessageAt > seenAtByInquiry[inquiryId] AND
 *     the last message is inbound (not a guest message).
 *   • Honest presence: per-row "Replies {typicalReplyLabel}" (real data only).
 *     NEVER "Online now" or "typing…".
 *   • Uses mini-chat-styles tokens for visual consistency. Dark-aware.
 *   • Under 800 lines.
 */

import { useEffect, useRef, useState } from "react";

import {
  DEFAULT_ACCENT,
  FONT,
  paletteFor,
  readableOn,
  type SurfaceMode,
} from "./mini-chat-styles";
import type { GuestInquirySummary } from "@/lib/inquiry/guest-chat-contract";
import type { Translator } from "@/i18n/interpolate";
import { createTranslator } from "@/i18n/messages";
import { AvatarCircle } from "./GuestThreadSwitcherParts";
import { ConversationRow } from "./GuestThreadSwitcherRow";
import { hasNewInbound } from "./guest-thread-switcher-helpers";

// ─────────────────────────────────────────────────────────────────────────────
// Local types
// ─────────────────────────────────────────────────────────────────────────────

export type GuestThreadSwitcherProps = {
  inquiries: GuestInquirySummary[];
  activeInquiryId: string | null;
  accent: string;
  accentInk: string;
  onSelect: (inquiryId: string) => void;
  /**
   * seenAtByInquiry[inquiryId] = ISO timestamp of the last message the panel
   * rendered for that thread. The switcher uses this to compute the 'new' dot
   * entirely client-side (the server always sets unreadHint:false).
   */
  seenAtByInquiry: Record<string, string>;
  /**
   * Layout hint (Lane C / F4). Default "rail" — the compact horizontal avatar
   * rail used in the mini panel header. "list" forces the vertical list layout
   * used in the expanded 2-pane left pane regardless of item count.
   */
  layout?: "rail" | "list";
  /** Jon 360 Phase 7 — dark surface variant for noir tenants. Default "light". */
  surfaceMode?: SurfaceMode;
  /**
   * Guest-locale translator (resolved from brand.locale). Phase 5 — project
   * labels + draft/sent pills. Optional for back-compat with callers that have
   * not been threaded a translator yet; falls back to an English translator.
   */
  t?: Translator;
};

/** Default English translator when a caller has not threaded one through. */
const FALLBACK_T: Translator = createTranslator("en");

// ─────────────────────────────────────────────────────────────────────────────
// Layouts: rail (≤4) vs dropdown (5+)
// ─────────────────────────────────────────────────────────────────────────────

function AvatarRail({
  inquiries,
  activeInquiryId,
  accent,
  accentInk,
  onSelect,
  seenAtByInquiry,
  surfaceMode = "light",
  t = FALLBACK_T,
}: GuestThreadSwitcherProps) {
  const C = paletteFor(surfaceMode);
  return (
    <div
      role="tablist"
      aria-label={t("public.guestChat.switcherAria")}
      style={{
        display: "flex",
        gap: 6,
        overflowX: "auto",
        padding: "8px 14px",
        borderBottom: `1px solid ${C.borderSoft}`,
        background: C.surfaceFaint,
        scrollbarWidth: "none",
      }}
    >
      {inquiries.map((inq) => {
        const isActive = inq.inquiryId === activeInquiryId;
        const showNew = !isActive && hasNewInbound(inq, seenAtByInquiry);

        return (
          <button
            key={inq.inquiryId}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={`${inq.projectLabel}${showNew ? `, ${t("public.guestChat.switcherNewMessageSuffix")}` : ""}`}
            onClick={() => onSelect(inq.inquiryId)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              padding: "4px 6px",
              borderRadius: 10,
              border: "none",
              background: isActive ? `${accent}18` : "transparent",
              cursor: "pointer",
              flexShrink: 0,
              minWidth: 52,
              maxWidth: 72,
              position: "relative",
              transition: "background 120ms",
            }}
          >
            <div style={{ position: "relative" }}>
              <AvatarCircle
                portraitUrl={inq.talentPortraitUrl}
                name={inq.talentName}
                accent={isActive ? accent : C.inkDim}
                accentInk={accentInk}
                size={36}
                active={isActive}
                C={C}
              />
              {showNew && (
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    top: 0,
                    right: 0,
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    background: accent,
                    border: `1.5px solid ${C.surface}`,
                  }}
                />
              )}
            </div>
            <span
              style={{
                fontSize: 10,
                fontWeight: isActive ? 700 : 400,
                color: isActive ? accent : C.inkMuted,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                width: "100%",
                textAlign: "center",
                fontFamily: FONT,
                lineHeight: 1.2,
              }}
            >
              {inq.projectLabel}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dropdown overlay for 5+ conversations
// ─────────────────────────────────────────────────────────────────────────────

function DropdownSwitcher({
  inquiries,
  activeInquiryId,
  accent,
  accentInk,
  onSelect,
  seenAtByInquiry,
  surfaceMode = "light",
  t = FALLBACK_T,
}: GuestThreadSwitcherProps) {
  const active = inquiries.find((i) => i.inquiryId === activeInquiryId) ?? inquiries[0];
  const accentComputed = accent ?? DEFAULT_ACCENT;
  const accentInkComputed = accentInk ?? readableOn(accentComputed);

  // We render a compact trigger that expands a dropdown list.
  // Using CSS :hover approach via data-open attribute + inline style toggle
  // handled by a simple boolean state.
  return (
    <DropdownBody
      inquiries={inquiries}
      active={active}
      activeInquiryId={activeInquiryId}
      accent={accentComputed}
      accentInk={accentInkComputed}
      onSelect={onSelect}
      seenAtByInquiry={seenAtByInquiry}
      surfaceMode={surfaceMode}
      t={t}
    />
  );
}

function DropdownBody({
  inquiries,
  active,
  activeInquiryId,
  accent,
  accentInk,
  onSelect,
  seenAtByInquiry,
  surfaceMode = "light",
  t,
}: {
  inquiries: GuestInquirySummary[];
  active: GuestInquirySummary | undefined;
  activeInquiryId: string | null;
  accent: string;
  accentInk: string;
  onSelect: (id: string) => void;
  seenAtByInquiry: Record<string, string>;
  surfaceMode?: SurfaceMode;
  t: Translator;
}) {
  const C = paletteFor(surfaceMode);
  // Simple open/close state — we render all conversations as a collapsed list
  // that expands on click of the trigger button.
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  const hasAnyNew = inquiries.some(
    (inq) => inq.inquiryId !== activeInquiryId && hasNewInbound(inq, seenAtByInquiry),
  );

  return (
    <div
      ref={ref}
      style={{
        padding: "6px 14px",
        borderBottom: `1px solid ${C.borderSoft}`,
        background: C.surfaceFaint,
        position: "relative",
      }}
    >
      {/* Trigger */}
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: "4px 0",
          width: "100%",
          fontFamily: FONT,
        }}
      >
        {active && (
          <AvatarCircle
            portraitUrl={active.talentPortraitUrl}
            name={active.talentName}
            accent={accent}
            accentInk={accentInk}
            size={28}
            active
            C={C}
          />
        )}
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: C.ink,
            flex: 1,
            textAlign: "left",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {active?.projectLabel ?? t("public.guestChat.switcherSelectProject")}
        </span>
        {hasAnyNew && !open && (
          <span
            aria-label="Unread conversations"
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: accent,
              flexShrink: 0,
            }}
          />
        )}
        <span
          aria-hidden
          style={{
            fontSize: 10,
            color: C.inkMuted,
            transition: "transform 150ms",
            transform: open ? "rotate(180deg)" : "none",
            display: "inline-block",
          }}
        >
          ▾
        </span>
      </button>

      {/* Dropdown list */}
      {open && (
        <div
          role="listbox"
          aria-label={t("public.guestChat.switcherAria")}
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 99,
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderTop: "none",
            borderBottomLeftRadius: 12,
            borderBottomRightRadius: 12,
            maxHeight: 260,
            overflowY: "auto",
            boxShadow: "0 8px 24px -6px rgba(16,18,29,0.18)",
          }}
        >
          {inquiries.map((inq) => (
            <ConversationRow
              key={inq.inquiryId}
              inq={inq}
              isActive={inq.inquiryId === activeInquiryId}
              accent={accent}
              accentInk={accentInk}
              onSelect={(id) => {
                onSelect(id);
                setOpen(false);
              }}
              seenAtByInquiry={seenAtByInquiry}
              surfaceMode={surfaceMode}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GuestThreadSwitcher — rendered by the wiring agent in the MiniChatPanel
 * header area. Returns null for single-thread guests (progressive disclosure).
 *
 * When layout="list" (Lane C / F4 expanded left pane), bypasses the rail/dropdown
 * selection and renders the vertical ConversationRow list directly. All entries are
 * shown as a scrollable vertical list (no progressive-disclosure threshold applies
 * in this mode — the host panel controls visiblity via the onListGuestInquiries
 * fetch). Single-item lists still render in list mode (the host decides visibility).
 */
export function GuestThreadSwitcher(props: GuestThreadSwitcherProps) {
  const { inquiries, layout = "rail" } = props;

  const accent = props.accent ?? DEFAULT_ACCENT;
  const accentInk = props.accentInk ?? readableOn(accent);
  const t = props.t ?? FALLBACK_T;
  const merged = { ...props, accent, accentInk, t };

  // "list" layout — expanded left pane. Show all conversations as a vertical list.
  // No <2 threshold: the expanded pane always shows whatever we have.
  if (layout === "list") {
    return (
      <div
        role="listbox"
        aria-label={t("public.guestChat.switcherAria")}
        style={{ display: "flex", flexDirection: "column" }}
      >
        {inquiries.map((inq) => (
          <ConversationRow
            key={inq.inquiryId}
            inq={inq}
            isActive={inq.inquiryId === merged.activeInquiryId}
            accent={accent}
            accentInk={accentInk}
            onSelect={merged.onSelect}
            seenAtByInquiry={merged.seenAtByInquiry}
            surfaceMode={merged.surfaceMode}
            t={t}
          />
        ))}
      </div>
    );
  }

  // Default "rail" layout — § 10 progressive disclosure: single-thread guests see nothing.
  if (inquiries.length < 2) return null;

  // ≤4 → compact horizontal avatar-rail (fits in the panel header without scroll).
  // 5+ → compact dropdown trigger (prevents overflow).
  if (inquiries.length <= 4) {
    return <AvatarRail {...merged} />;
  }
  return <DropdownSwitcher {...merged} />;
}
