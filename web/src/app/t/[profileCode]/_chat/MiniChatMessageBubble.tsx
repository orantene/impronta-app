"use client";

/**
 * MiniChatMessageBubble — a single rendered row in the guest-chat popup stream
 * (Lane D). Split out of MiniChatPanel.tsx to keep that file under the
 * max-lines cap. Renders by `authorRole` / `authorLabel` only — it never
 * recomputes authorship from raw ids (the server resolves that per contract).
 */

import type { GuestThreadMessage } from "@/lib/inquiry/guest-chat-contract";

import { C, formatTime, labelForKind } from "./mini-chat-styles";

/**
 * A row in the visible stream — either a server/persisted message or a local
 * optimistic placeholder keyed on a tmp- id (reconciled by created order).
 */
export type StreamRow = GuestThreadMessage & { pending?: boolean; failed?: boolean };

export function MiniChatMessageBubble({ m, accent }: { m: StreamRow; accent: string }) {
  const mine = m.authorRole === "guest";
  const system = m.authorRole === "system";

  if (system) {
    return (
      <div
        style={{
          alignSelf: "center",
          textAlign: "center",
          maxWidth: "92%",
          fontSize: 11.5,
          color: C.systemInk,
          background: C.surfaceFaint,
          borderRadius: 10,
          padding: "7px 11px",
          lineHeight: 1.45,
        }}
      >
        {m.isDeleted ? "Message removed" : m.body}
      </div>
    );
  }

  // Non-text kinds (offer/payment cards) get a generic labelled fallback for
  // the MVP popup — full ChatCard rendering is a fast-follow per the contract.
  const isCard = m.kind !== "text";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: mine ? "flex-end" : "flex-start",
        gap: 2,
      }}
    >
      {!mine && m.authorLabel && (
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            color: C.inkMuted,
            letterSpacing: 0.2,
            paddingLeft: 3,
          }}
        >
          {m.authorLabel}
        </div>
      )}
      <div
        style={{
          maxWidth: "82%",
          padding: isCard ? "11px 13px" : "9px 13px",
          borderRadius: mine ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
          background: isCard ? C.surfaceFaint : mine ? C.guestBubble : C.surfaceCool,
          color: mine && !isCard ? C.guestBubbleInk : C.ink,
          border: isCard ? `1px solid ${C.borderSoft}` : "none",
          fontSize: 13.5,
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          opacity: m.pending ? 0.6 : 1,
        }}
      >
        {isCard ? (
          <span>
            <span
              style={{
                display: "inline-block",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                color: accent,
                marginBottom: 3,
              }}
            >
              {labelForKind(m.kind)}
            </span>
            <br />
            {m.body || "Open the full conversation to view this update."}
          </span>
        ) : m.isDeleted ? (
          <em style={{ color: C.inkDim }}>Message removed</em>
        ) : (
          m.body
        )}
      </div>
      <div
        style={{
          fontSize: 9.5,
          color: m.failed ? C.danger : C.inkDim,
          paddingRight: mine ? 3 : 0,
          paddingLeft: mine ? 0 : 3,
        }}
      >
        {m.failed
          ? "Not sent — restored to the box"
          : m.pending
            ? "Sending…"
            : formatTime(m.createdAt)}
      </div>
    </div>
  );
}

export function SendIcon({ color }: { color: string }) {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}
