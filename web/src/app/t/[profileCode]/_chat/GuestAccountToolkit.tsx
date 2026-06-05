"use client";

/**
 * GuestAccountToolkit — the PROACTIVE "save this conversation / create your free
 * Tulala account" card inside the guest-chat panel (U3 / strategy §13 claim
 * flow + §5 trust ladder).
 *
 * Where ClaimEmailRecap is the REACTIVE recap ("we just emailed you a link"),
 * this toolkit is the proactive entry point: it invites the guest to claim a
 * free account at any time. It fires the EXACT SAME magic-link flow
 * (sendGuestClaimToEmail, injected as onAddClaimEmail — the same prop
 * ClaimEmailRecap uses). On confirm, the existing /auth/confirm path runs
 * merge_guest_session_to_client → the conversation lands in the unified client
 * inbox.
 *
 * COPY RULES (house): account/trust framed — "create your free account",
 * "save this conversation". NEVER "buy" / "buyer" / "pay" — the currency is an
 * account + verification, never money. Uses "you" / "client" only.
 *
 * TIER-AWARE:
 *   • identity === "account"        → the guest is already a registered client;
 *                                     the toolkit renders nothing (hides).
 *   • identity === "email_verified" → a calm "Your conversations are saved ✓".
 *   • "guest" / "identified"        → the actionable claim card. With an email
 *     on file it re-sends the magic link; without one it gently routes the guest
 *     to send a first message (which captures the email + auto-sends the link).
 *
 * Renders NOTHING server-side — onAddClaimEmail arrives as an injected prop
 * (null hides the action entirely). React-Compiler codebase: plain functions,
 * no manual useCallback/useMemo. Brand accent via mini-chat-styles tokens.
 */

import { useState } from "react";

import type { AddClaimEmailCallback } from "@/lib/inquiry/guest-chat-contract";

import { C } from "./mini-chat-styles";

/** Trust-tier identity union (kept LOCAL to this lane; integration promotes it). */
export type GuestAccountToolkitIdentity =
  | "guest"
  | "identified"
  | "email_verified"
  | "account";

export type GuestAccountToolkitProps = {
  /** The inquiry the claim email is registered against. Null pre-first-send. */
  inquiryId: string | null;
  /** The email already captured for this guest (drives the re-send). Null = none yet. */
  guestEmail: string | null;
  /** Trust-tier identity — controls hide/saved/actionable rendering. */
  identity: GuestAccountToolkitIdentity;
  /** Tenant brand accent (CSS color). */
  accent: string;
  /** Readable ink color for text on `accent`. */
  accentInk: string;
  /**
   * Injected claim/sign-in magic-link sender (the SAME onAddClaimEmail the
   * panel passes to ClaimEmailRecap). Null hides the action.
   */
  onAddClaimEmail: AddClaimEmailCallback | null;
};

export function GuestAccountToolkit({
  inquiryId,
  guestEmail,
  identity,
  accent,
  accentInk,
  onAddClaimEmail,
}: GuestAccountToolkitProps) {
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A registered client has nothing to claim — hide entirely.
  if (identity === "account") return null;

  // Already email-verified: a quiet reassurance, no action.
  if (identity === "email_verified") {
    return (
      <div style={savedWrapStyle}>
        <span aria-hidden style={{ color: accent, fontWeight: 700 }}>
          ✓
        </span>
        <span>Your conversations are saved to your Tulala account.</span>
      </div>
    );
  }

  const email = guestEmail?.trim() || null;
  const canSend = !!onAddClaimEmail && !!inquiryId && !!email && !sending;

  async function sendLink() {
    if (!onAddClaimEmail || !inquiryId || !email || sending) return;
    setSending(true);
    setError(null);
    const res = await onAddClaimEmail({ inquiryId, email });
    setSending(false);
    if (!res.ok) {
      setError(res.message || "Couldn't send the link. Please try again.");
      return;
    }
    setSentTo(res.email || email);
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>
          Save this conversation
        </div>
        <div style={{ fontSize: 11.5, lineHeight: 1.45, color: C.inkMuted }}>
          {email
            ? "Create your free Tulala account to keep every conversation in one place and pick up on any device."
            : "Send your first message and we'll set up a free Tulala account so this conversation is always saved to you."}
        </div>
      </div>

      {/* Confirmation once the link has been sent. */}
      {sentTo ? (
        <div style={{ fontSize: 11.5, color: C.inkMuted }}>
          Check <strong style={{ color: C.ink }}>{sentTo}</strong> for your sign-in link.
        </div>
      ) : email ? (
        <button
          type="button"
          onClick={() => void sendLink()}
          disabled={!canSend}
          style={{
            alignSelf: "flex-start",
            height: 32,
            padding: "0 14px",
            borderRadius: 8,
            border: "none",
            background: accent,
            color: accentInk,
            fontSize: 12,
            fontWeight: 600,
            cursor: canSend ? "pointer" : "not-allowed",
            opacity: canSend ? 1 : 0.55,
            transition: "opacity 120ms",
          }}
        >
          {sending ? "Sending…" : "Email me a sign-in link"}
        </button>
      ) : (
        <div style={{ fontSize: 11, color: C.inkDim, fontStyle: "italic" }}>
          Type a message below to get started.
        </div>
      )}

      {error && (
        <div role="alert" style={{ fontSize: 11, color: C.danger }}>
          {error}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles — cool/neutral surface + injected brand accent (house rule: no
// hard-coded black/gold on small components).
// ─────────────────────────────────────────────────────────────────────────────

const cardStyle = {
  alignSelf: "stretch",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  margin: "2px 2px",
  padding: "11px 12px",
  borderRadius: 12,
  background: C.surfaceFaint,
  border: `1px solid ${C.borderSoft}`,
} as const;

const savedWrapStyle = {
  alignSelf: "center",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 11.5,
  color: C.inkMuted,
  padding: "2px 8px",
  textAlign: "center",
} as const;
