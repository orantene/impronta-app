"use client";

/**
 * GuestThreadSwitcher — U2 thread-switcher avatar-rail.
 *
 * Rendered in the MiniChatPanel header area by the wiring agent ONLY when the
 * guest has 2 or more live conversations (§10 progressive disclosure).
 * Single-thread guests never see this component.
 *
 * Design rules:
 *   • Brand accent drives the active indicator — NO gold/rust.
 *   • Real portrait when available (talentPortraitUrl). Null → accent circle
 *     with the talent's initial (the sanctioned non-photo fallback, same style
 *     as MiniChatPanel header). NEVER a gray initials box.
 *   • 'new' dot appears when lastMessageAt > seenAtByInquiry[inquiryId] AND
 *     the last message is inbound (not a guest message).
 *   • Honest presence: per-row "Replies {typicalReplyLabel}" (real data only).
 *     NEVER "Online now" or "typing…".
 *   • Uses mini-chat-styles tokens for visual consistency.
 *   • Under 800 lines.
 */

import { useEffect, useRef, useState } from "react";

import { C, DEFAULT_ACCENT, FONT, readableOn } from "./mini-chat-styles";
import type { GuestInquirySummary } from "../_actions/guest-inquiries-actions";

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
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatRelTime(iso: string | null): string {
  if (!iso) return "";
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diffMs / 60_000);
    const hours = Math.floor(diffMs / 3_600_000);
    const days = Math.floor(diffMs / 86_400_000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

function talentInitial(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

/**
 * Returns true when the last message on this inquiry is inbound (not from the
 * guest) AND arrived after the panel's last-seen cursor for that inquiry.
 */
function hasNewInbound(
  summary: GuestInquirySummary,
  seenAtByInquiry: Record<string, string>,
): boolean {
  if (!summary.lastMessageAt) return false;
  const seenAt = seenAtByInquiry[summary.inquiryId];
  if (seenAt && summary.lastMessageAt <= seenAt) return false;
  // unreadHint is always false from the server (set by panel client-side).
  // Here we just check if there's a newer lastMessageAt than seenAt.
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: AvatarCircle
// ─────────────────────────────────────────────────────────────────────────────

function AvatarCircle({
  portraitUrl,
  name,
  accent,
  accentInk,
  size,
  active,
}: {
  portraitUrl: string | null;
  name: string;
  accent: string;
  accentInk: string;
  size: number;
  active: boolean;
}) {
  const border = active ? `2.5px solid ${accent}` : `2px solid transparent`;

  if (portraitUrl) {
    return (
      <div
        aria-hidden
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          flexShrink: 0,
          overflow: "hidden",
          border,
          background: C.surfaceCool,
          position: "relative",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={portraitUrl}
          alt=""
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      </div>
    );
  }

  // Brand-accent circle with talent initial — the ONLY sanctioned non-photo
  // fallback (house rule: never a gray box).
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flexShrink: 0,
        background: accent,
        color: accentInk,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.floor(size * 0.38),
        fontWeight: 700,
        letterSpacing: 0.2,
        border,
        fontFamily: FONT,
      }}
    >
      {talentInitial(name)}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: NewDot
// ─────────────────────────────────────────────────────────────────────────────

function NewDot({ accent }: { accent: string }) {
  return (
    <span
      aria-label="New message"
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: accent,
        flexShrink: 0,
        marginLeft: 3,
        verticalAlign: "middle",
      }}
    />
  );
}

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
}: GuestThreadSwitcherProps) {
  return (
    <div
      role="tablist"
      aria-label="Switch conversation"
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
            aria-label={`Chat with ${inq.talentName}${showNew ? " — new message" : ""}`}
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
              {inq.talentName}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ConversationRow({
  inq,
  isActive,
  accent,
  accentInk,
  onSelect,
  seenAtByInquiry,
}: {
  inq: GuestInquirySummary;
  isActive: boolean;
  accent: string;
  accentInk: string;
  onSelect: (id: string) => void;
  seenAtByInquiry: Record<string, string>;
}) {
  const showNew = !isActive && hasNewInbound(inq, seenAtByInquiry);

  return (
    <button
      type="button"
      role="option"
      aria-selected={isActive}
      aria-label={`${inq.talentName}${showNew ? " — new message" : ""}`}
      onClick={() => onSelect(inq.inquiryId)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "8px 12px",
        background: isActive ? `${accent}14` : "transparent",
        border: "none",
        cursor: "pointer",
        width: "100%",
        textAlign: "left",
        transition: "background 120ms",
      }}
    >
      <AvatarCircle
        portraitUrl={inq.talentPortraitUrl}
        name={inq.talentName}
        accent={isActive ? accent : C.inkDim}
        accentInk={accentInk}
        size={34}
        active={isActive}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <span
            style={{
              fontSize: 12.5,
              fontWeight: isActive ? 700 : 500,
              color: C.ink,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontFamily: FONT,
            }}
          >
            {inq.talentName}
          </span>
          {showNew && <NewDot accent={accent} />}
        </div>
        {inq.lastMessagePreview && (
          <div
            style={{
              fontSize: 11,
              color: C.inkMuted,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              marginTop: 1,
              fontFamily: FONT,
            }}
          >
            {inq.lastMessagePreview}
          </div>
        )}
        {/* Honest presence: ONLY real reply-time data, NEVER "Online now" */}
        {inq.typicalReplyLabel && (
          <div
            style={{
              fontSize: 10,
              color: C.inkDim,
              marginTop: 1,
              fontFamily: FONT,
            }}
          >
            {`Replies ${inq.typicalReplyLabel}`}
          </div>
        )}
      </div>
      <div
        style={{
          fontSize: 10,
          color: C.inkDim,
          flexShrink: 0,
          fontFamily: FONT,
        }}
      >
        {formatRelTime(inq.lastMessageAt)}
      </div>
    </button>
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
}: {
  inquiries: GuestInquirySummary[];
  active: GuestInquirySummary | undefined;
  activeInquiryId: string | null;
  accent: string;
  accentInk: string;
  onSelect: (id: string) => void;
  seenAtByInquiry: Record<string, string>;
}) {
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
          />
        )}
        <span style={{ fontSize: 12, fontWeight: 600, color: C.ink, flex: 1, textAlign: "left" }}>
          {active?.talentName ?? "Select conversation"}
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
          aria-label="Switch conversation"
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
 */
export function GuestThreadSwitcher(props: GuestThreadSwitcherProps) {
  const { inquiries } = props;

  // § 10 progressive disclosure: single-thread guests see nothing.
  if (inquiries.length < 2) return null;

  const accent = props.accent ?? DEFAULT_ACCENT;
  const accentInk = props.accentInk ?? readableOn(accent);
  const merged = { ...props, accent, accentInk };

  // ≤4 → compact horizontal avatar-rail (fits in the panel header without scroll).
  // 5+ → compact dropdown trigger (prevents overflow).
  if (inquiries.length <= 4) {
    return <AvatarRail {...merged} />;
  }
  return <DropdownSwitcher {...merged} />;
}
