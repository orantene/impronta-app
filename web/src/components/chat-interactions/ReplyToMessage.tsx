"use client";

/**
 * ReplyToMessage — primitives for replying to a specific message in a
 * thread (WhatsApp-style quoted reply).
 *
 * Three pieces:
 *   1. <ReplyTriggerButton> — small "↩ Reply" button rendered next to
 *      a message bubble (hover on desktop, long-press menu item on
 *      mobile).
 *   2. <ReplyContextBar> — pinned bar above the composer that shows
 *      the quoted message the user is replying to, with a "×" to
 *      cancel. Caller passes the active reply target.
 *   3. <QuotedMessage> — the inline quote block rendered INSIDE a
 *      reply message bubble, showing the original sender + snippet
 *      and a tap-to-scroll-to-original handler.
 *
 * The engine side needs a `reply_to_message_id` column on the
 * messages table (placeholder; we don't add the migration here so
 * this stays a wireable UI primitive). Surfaces that want to enable
 * the feature track `replyTarget` state, pass it to the composer,
 * and write the id alongside the message body on send.
 */

import type { ReactNode } from "react";

export type ReplyTarget = {
  messageId: string;
  senderName: string;
  /** Plain-text snippet of the original body, truncated for the bar. */
  snippet: string;
  /** When the message has an attachment, surface a paperclip hint. */
  hasAttachment?: boolean;
};

/* ─── Trigger ─────────────────────────────────────────────────────── */

export function ReplyTriggerButton({
  onClick, ariaLabel = "Reply to message",
}: { onClick: () => void; ariaLabel?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title="Reply"
      style={{
        width: 28, height: 28,
        padding: 0,
        border: "1px solid rgba(24,24,27,0.10)",
        background: "#fff",
        cursor: "pointer",
        borderRadius: 999,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        color: "rgba(11,11,13,0.55)",
        boxShadow: "0 2px 8px rgba(11,11,13,0.06)",
      }}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M5 4L2 7l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M2 7h6c2 0 4 1 4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
    </button>
  );
}

/* ─── Context bar above composer ──────────────────────────────────── */

export function ReplyContextBar({
  target, onCancel,
}: { target: ReplyTarget; onCancel: () => void }) {
  return (
    <div
      data-msg-reply-bar
      role="region"
      aria-label={`Replying to ${target.senderName}`}
      style={{
        display: "flex", alignItems: "stretch", gap: 8,
        padding: "8px 10px 8px 6px",
        background: "rgba(15,79,62,0.05)",
        borderTop: "1px solid rgba(15,79,62,0.18)",
        borderBottom: "1px solid rgba(24,24,27,0.06)",
        fontFamily: '"Inter", system-ui, sans-serif',
      }}
    >
      <span aria-hidden style={{
        width: 3,
        borderRadius: 2,
        background: "#0F4F3E",
        flexShrink: 0,
      }} />
      <div className="flex-1 min-w-0">
        <div style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          color: "#0F4F3E",
        }}>
          Replying to {target.senderName}
        </div>
        <div style={{
          fontSize: 12,
          color: "rgba(11,11,13,0.65)",
          marginTop: 2,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {target.hasAttachment && <span aria-hidden style={{ marginRight: 4 }}>📎</span>}
          {target.snippet}
        </div>
      </div>
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancel reply"
        style={{
          width: 28, height: 28,
          padding: 0,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          color: "rgba(11,11,13,0.45)",
          fontSize: 18,
          lineHeight: 1,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}
      >×</button>
    </div>
  );
}

/* ─── Quoted message inside a reply bubble ────────────────────────── */

export function QuotedMessage({
  senderName, snippet, hasAttachment, onJumpToOriginal,
}: {
  senderName: string;
  snippet: string;
  hasAttachment?: boolean;
  /** Click handler — scroll to the original message. Caller wires the
   *  scroll-into-view + highlight pulse. */
  onJumpToOriginal?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onJumpToOriginal}
      disabled={!onJumpToOriginal}
      style={{
        display: "flex", alignItems: "stretch", gap: 8,
        padding: "6px 8px",
        background: "rgba(11,11,13,0.04)",
        border: "none",
        borderRadius: 8,
        cursor: onJumpToOriginal ? "pointer" : "default",
        textAlign: "left",
        fontFamily: '"Inter", system-ui, sans-serif',
        width: "100%",
        marginBottom: 4,
      }}
    >
      <span aria-hidden style={{
        width: 3,
        borderRadius: 2,
        background: "#0F4F3E",
        flexShrink: 0,
      }} />
      <div className="flex-1 min-w-0">
        <div style={{
          fontSize: 11,
          fontWeight: 700,
          color: "#0F4F3E",
        }}>{senderName}</div>
        <div style={{
          fontSize: 11.5,
          color: "rgba(11,11,13,0.65)",
          marginTop: 1,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {hasAttachment && <span aria-hidden style={{ marginRight: 4 }}>📎</span>}
          {snippet}
        </div>
      </div>
    </button>
  );
}

/* ─── Helper: build a ReplyTarget from a message row ──────────────── */

export function replyTargetFromMessage(msg: {
  id: string;
  sender_name?: string | null;
  senderName?: string | null;
  body: string;
  hasAttachment?: boolean;
}, fallbackName = "Someone"): ReplyTarget {
  const name = msg.sender_name ?? msg.senderName ?? fallbackName;
  const snippet = (msg.body || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return {
    messageId: msg.id,
    senderName: name,
    snippet: snippet || "(no text)",
    hasAttachment: msg.hasAttachment,
  };
}

/* ─── Message hover-actions row (reply + react triggers together) ──
 *  Convenience row that bundles the two most common per-message
 *  affordances. Place inside the message bubble's hover state. */

export function MessageHoverActions({
  onReply, onReact, onOpenMenu,
  childExtras,
}: {
  onReply?: () => void;
  onReact?: () => void;
  onOpenMenu?: () => void;
  /** Optional extra trigger buttons appended to the row. */
  childExtras?: ReactNode;
}) {
  return (
    <div
      data-msg-hover-actions
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: 4,
        background: "rgba(255,255,255,0.95)",
        backdropFilter: "blur(6px)",
        border: "1px solid rgba(24,24,27,0.08)",
        borderRadius: 999,
        boxShadow: "0 6px 16px rgba(11,11,13,0.08)",
      }}
    >
      {onReact && <ReactPlaceholderIcon onClick={onReact} />}
      {onReply && <ReplyTriggerButton onClick={onReply} />}
      {childExtras}
      {onOpenMenu && <DotsPlaceholderIcon onClick={onOpenMenu} />}
    </div>
  );
}

function ReactPlaceholderIcon({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Add reaction"
      style={{
        width: 28, height: 28,
        padding: 0,
        border: "none",
        background: "transparent",
        cursor: "pointer",
        borderRadius: 999,
        color: "rgba(11,11,13,0.55)",
      }}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
        <circle cx="5" cy="6" r="0.7" fill="currentColor"/>
        <circle cx="9" cy="6" r="0.7" fill="currentColor"/>
        <path d="M5 9c.5.5 1.2.8 2 .8s1.5-.3 2-.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    </button>
  );
}

function DotsPlaceholderIcon({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Message actions"
      style={{
        width: 28, height: 28,
        padding: 0,
        border: "none",
        background: "transparent",
        cursor: "pointer",
        borderRadius: 999,
        color: "rgba(11,11,13,0.55)",
      }}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="3" cy="7" r="1.2" fill="currentColor"/>
        <circle cx="7" cy="7" r="1.2" fill="currentColor"/>
        <circle cx="11" cy="7" r="1.2" fill="currentColor"/>
      </svg>
    </button>
  );
}
