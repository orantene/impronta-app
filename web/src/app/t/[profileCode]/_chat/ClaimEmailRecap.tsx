"use client";

/**
 * ClaimEmailRecap — the post-send "Link sent to {email}" recap plus the
 * "Use a different email" affordance (guest-chat multi-email / first-confirm-wins).
 *
 * Extracted out of MiniChatPanel so that file stays under the max-lines bar and
 * this self-contained piece owns its own input/sending/error state. It renders
 * NOTHING server-side — the add-claim-email action arrives as an injected prop
 * (onAddClaimEmail) exactly like the panel's other actions; null hides the
 * "Use a different email" control entirely.
 *
 * Memoization note: like the rest of the chat surface this runs under the React
 * Compiler, so it uses plain functions (no manual useCallback/useMemo).
 */

import { useState } from "react";

import type { AddClaimEmailCallback } from "@/lib/inquiry/guest-chat-contract";

import { C, EMAIL_RE, inputStyle, primaryBtnStyle } from "./mini-chat-styles";

export function ClaimEmailRecap({
  emailedTo,
  inquiryId,
  accent,
  accentInk,
  onAddClaimEmail,
}: {
  /** The email the first link was sent to. */
  emailedTo: string;
  /** The inquiry the extra claim email is registered against. */
  inquiryId: string | null;
  accent: string;
  accentInk: string;
  /** Injected add-claim-email action. Null hides "Use a different email". */
  onAddClaimEmail: AddClaimEmailCallback | null;
}) {
  const [showAltEmail, setShowAltEmail] = useState(false);
  const [altEmail, setAltEmail] = useState("");
  const [altSending, setAltSending] = useState(false);
  const [altError, setAltError] = useState<string | null>(null);
  const [altEmailsSent, setAltEmailsSent] = useState<string[]>([]);

  // Send the claim/sign-in link to a different OR additional email; whichever
  // email is confirmed FIRST claims the conversation (server-side first-confirm).
  async function submitAltEmail() {
    const addr = altEmail.trim();
    if (!onAddClaimEmail || !inquiryId || !EMAIL_RE.test(addr) || altSending) return;

    setAltSending(true);
    setAltError(null);

    const res = await onAddClaimEmail({ inquiryId, email: addr });

    setAltSending(false);

    if (!res.ok) {
      setAltError(res.message || "Couldn't send to that email. Try another.");
      return;
    }

    setAltEmailsSent((cur) => (cur.includes(addr) ? cur : [...cur, addr]));
    setAltEmail("");
    // Keep the input open so the guest can quickly add another.
  }

  const altReady = EMAIL_RE.test(altEmail.trim()) && !altSending;

  return (
    <div
      style={{
        alignSelf: "center",
        textAlign: "center",
        fontSize: 11,
        color: C.systemInk,
        padding: "2px 8px",
        maxWidth: "92%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 5,
      }}
    >
      <div>
        Link sent to <strong style={{ color: C.inkMuted }}>{emailedTo}</strong> — check your inbox
        to continue.
      </div>

      {/* Confirmations for any extra emails the guest added. */}
      {altEmailsSent.map((addr) => (
        <div key={addr} style={{ color: C.inkMuted }}>
          Link sent to <strong>{addr}</strong>
        </div>
      ))}

      {onAddClaimEmail &&
        (!showAltEmail ? (
          <button
            type="button"
            onClick={() => {
              setShowAltEmail(true);
              setAltError(null);
            }}
            style={{
              border: "none",
              background: "transparent",
              color: C.inkMuted,
              fontSize: 11,
              textDecoration: "underline",
              cursor: "pointer",
              padding: "1px 2px",
            }}
          >
            Use a different email
          </button>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "stretch",
              gap: 4,
              width: "100%",
              maxWidth: 260,
            }}
          >
            <div style={{ display: "flex", gap: 6 }}>
              <input
                value={altEmail}
                onChange={(e) => setAltEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void submitAltEmail();
                  }
                }}
                placeholder="name@example.com"
                type="email"
                autoComplete="email"
                style={{ ...inputStyle, flex: 1, fontSize: 12 }}
              />
              <button
                type="button"
                onClick={() => void submitAltEmail()}
                disabled={!altReady}
                style={{
                  ...primaryBtnStyle(accent, accentInk),
                  width: "auto",
                  padding: "0 12px",
                  height: 34,
                  fontSize: 12,
                  opacity: altReady ? 1 : 0.5,
                  cursor: altReady ? "pointer" : "not-allowed",
                }}
              >
                {altSending ? "…" : "Send link"}
              </button>
            </div>
            {altError && (
              <div role="alert" style={{ color: C.danger, fontSize: 11 }}>
                {altError}
              </div>
            )}
          </div>
        ))}
    </div>
  );
}
