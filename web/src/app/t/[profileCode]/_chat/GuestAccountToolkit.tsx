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

import { useEffect, useState } from "react";

import type { AddClaimEmailCallback, CheckGuestClaimEmailCallback } from "@/lib/inquiry/guest-chat-contract";

import {
  EMAIL_RE,
  inputStyleFor,
  paletteFor,
  primaryBtnStyle,
  type Palette,
  type SurfaceMode,
} from "./mini-chat-styles";

/** Trust-tier identity union (kept LOCAL to this lane; integration promotes it). */
export type GuestAccountToolkitIdentity =
  | "guest"
  | "identified"
  | "email_verified"
  | "account";

const RESEND_COOLDOWN_SECS = 30;

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
  /** Read-only probe for already-registered addresses (change-email form). */
  onCheckClaimEmail?: CheckGuestClaimEmailCallback | null;
  /**
   * Called when the guest corrects their primary contact email so the panel can
   * sync emailedTo / gate prefill.
   */
  onGuestEmailUpdated?: (email: string) => void;
  /**
   * When true, demote the CTA button from a filled accent button to a
   * secondary/outline style so there is only ONE primary CTA in the panel at
   * a time (fix 8). Set to true when threadStatus is offer_pending|approved|booked
   * (the OpenFullConversationLink footer is already the filled accent primary).
   */
  deemphasizeButton?: boolean;
  /** Jon 360 Phase 7 — dark surface variant for noir tenants. Default "light". */
  surfaceMode?: SurfaceMode;
};

export function GuestAccountToolkit({
  inquiryId,
  guestEmail,
  identity,
  accent,
  accentInk,
  onAddClaimEmail,
  onCheckClaimEmail,
  onGuestEmailUpdated,
  deemphasizeButton = false,
  surfaceMode = "light",
}: GuestAccountToolkitProps) {
  const C = paletteFor(surfaceMode);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldownSecs, setCooldownSecs] = useState(0);
  const [showChangeEmail, setShowChangeEmail] = useState(false);
  const [editEmail, setEditEmail] = useState("");
  const [editEmailNotice, setEditEmailNotice] = useState<string | null>(null);
  const [editEmailBlocksSubmit, setEditEmailBlocksSubmit] = useState(false);

  useEffect(() => {
    if (cooldownSecs <= 0) return;
    const timer = window.setTimeout(() => {
      setCooldownSecs((cur) => Math.max(0, cur - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [cooldownSecs]);

  useEffect(() => {
    if (!showChangeEmail || !onCheckClaimEmail || !inquiryId) {
      setEditEmailNotice(null);
      setEditEmailBlocksSubmit(false);
      return;
    }

    const addr = editEmail.trim();
    if (!EMAIL_RE.test(addr)) {
      setEditEmailNotice(null);
      setEditEmailBlocksSubmit(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const res = await onCheckClaimEmail({
          email: addr,
          inquiryId,
          replacePrimary: true,
        });
        if (cancelled) return;
        if (!res.ok) {
          setEditEmailNotice(null);
          setEditEmailBlocksSubmit(false);
          return;
        }
        setEditEmailNotice(res.message ?? null);
        setEditEmailBlocksSubmit(Boolean(res.blocksSubmit));
      })();
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [editEmail, inquiryId, onCheckClaimEmail, showChangeEmail]);

  // A registered client has nothing to claim — hide entirely.
  if (identity === "account") return null;

  // Already email-verified: a quiet reassurance, no action.
  if (identity === "email_verified") {
    return (
      <div style={savedWrapStyle(C)}>
        <span aria-hidden style={{ color: accent, fontWeight: 700 }}>
          ✓
        </span>
        <span>Your conversations are saved to your Tulala account.</span>
      </div>
    );
  }

  const email = guestEmail?.trim() || null;
  const inCooldown = cooldownSecs > 0;
  const canSend =
    !!onAddClaimEmail && !!inquiryId && !!email && !sending && !inCooldown;

  function startCooldown() {
    setCooldownSecs(RESEND_COOLDOWN_SECS);
  }

  async function sendLink(targetEmail: string, replacePrimary = false) {
    if (!onAddClaimEmail || !inquiryId || sending || inCooldown) return;
    const addr = targetEmail.trim();
    if (!EMAIL_RE.test(addr)) {
      setError("Enter a valid email address.");
      return;
    }

    setSending(true);
    setError(null);

    const res = await onAddClaimEmail({
      inquiryId,
      email: addr,
      replacePrimary,
    });

    setSending(false);

    if (!res.ok) {
      setError(res.message || "Couldn't send the link. Please try again.");
      return;
    }

    const confirmed = res.email || addr;
    setSentTo(confirmed);
    startCooldown();

    if (replacePrimary && confirmed !== email) {
      onGuestEmailUpdated?.(confirmed);
      setShowChangeEmail(false);
    }
  }

  function openChangeEmail() {
    setEditEmail(email ?? "");
    setShowChangeEmail(true);
    setError(null);
    setEditEmailNotice(null);
    setEditEmailBlocksSubmit(false);
  }

  const editSameAsCurrent =
    EMAIL_RE.test(editEmail.trim()) &&
    editEmail.trim().toLowerCase() === (email ?? "").trim().toLowerCase();

  const editReady =
    EMAIL_RE.test(editEmail.trim()) &&
    !sending &&
    !inCooldown &&
    !editEmailBlocksSubmit &&
    !editSameAsCurrent;

  const primaryBtnStyleResolved = deemphasizeButton
    ? {
        alignSelf: "flex-start",
        height: 32,
        padding: "0 14px",
        borderRadius: 8,
        border: `1.5px solid ${accent}`,
        background: "transparent",
        color: accent,
        fontSize: 12,
        fontWeight: 600,
        cursor: canSend ? "pointer" : "not-allowed",
        opacity: canSend ? 1 : 0.55,
        transition: "opacity 120ms",
      }
    : {
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
      };

  const resendLabel = sending
    ? "Sending…"
    : inCooldown
      ? `Try again in ${cooldownSecs}s`
      : "Email me a sign-in link";

  return (
    <div style={cardStyle(C)}>
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

      {sentTo && (
        <div style={{ fontSize: 11.5, color: C.inkMuted }}>
          Check <strong style={{ color: C.ink }}>{sentTo}</strong> for your sign-in link.
        </div>
      )}

      {email ? (
        <>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 8,
            }}
          >
            <button
              type="button"
              onClick={() => void sendLink(email)}
              disabled={!canSend}
              style={primaryBtnStyleResolved}
            >
              {resendLabel}
            </button>

            {onAddClaimEmail && !showChangeEmail && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11.5,
                  color: C.inkMuted,
                }}
              >
                <span>or</span>
                <button
                  type="button"
                  onClick={openChangeEmail}
                  style={textLinkStyle(C)}
                >
                  change email
                </button>
              </div>
            )}
          </div>

          {showChangeEmail && onAddClaimEmail && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 11, color: C.inkMuted }}>
                Your email
              </label>
              <input
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (editReady) void sendLink(editEmail, true);
                  }
                }}
                placeholder="name@example.com"
                type="email"
                autoComplete="email"
                style={{ ...inputStyleFor(C), fontSize: 12 }}
              />
              {editSameAsCurrent && !editEmailNotice && (
                <div
                  role="status"
                  style={{
                    fontSize: 11,
                    lineHeight: 1.45,
                    color: C.inkMuted,
                  }}
                >
                  This is already the email on this conversation.
                </div>
              )}
              {editEmailNotice && (
                <div
                  role={editEmailBlocksSubmit ? "alert" : "status"}
                  style={{
                    fontSize: 11,
                    lineHeight: 1.45,
                    color: editEmailBlocksSubmit ? C.danger : C.inkMuted,
                  }}
                >
                  {editEmailNotice}
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => void sendLink(editEmail, true)}
                  disabled={!editReady}
                  style={{
                    ...primaryBtnStyle(accent, accentInk),
                    width: "auto",
                    padding: "0 12px",
                    height: 32,
                    fontSize: 12,
                    opacity: editReady ? 1 : 0.5,
                    cursor: editReady ? "pointer" : "not-allowed",
                  }}
                >
                  {sending ? "Saving…" : inCooldown ? `Wait ${cooldownSecs}s` : "Save & send link"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowChangeEmail(false);
                    setError(null);
                    setEditEmailNotice(null);
                    setEditEmailBlocksSubmit(false);
                  }}
                  style={textLinkStyle(C)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
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

const cardStyle = (C: Palette) =>
  ({
    alignSelf: "stretch",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    margin: "2px 2px",
    padding: "11px 12px",
    borderRadius: 12,
    background: C.surfaceFaint,
    border: `1px solid ${C.borderSoft}`,
  }) as const;

const savedWrapStyle = (C: Palette) =>
  ({
    alignSelf: "center",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11.5,
    color: C.inkMuted,
    padding: "2px 8px",
    textAlign: "center",
  }) as const;

const textLinkStyle = (C: Palette) =>
  ({
    border: "none",
    background: "transparent",
    color: C.inkMuted,
    fontSize: 11.5,
    textDecoration: "underline",
    cursor: "pointer",
    padding: "1px 2px",
  }) as const;
