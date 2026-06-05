"use client";

/**
 * OpenFullConversationLink — U1 (Mini→Full Messages expansion).
 *
 * The "Open full conversation ↗" affordance rendered INSIDE the MiniChatPanel
 * footer (replacing the old inert <a>). A plain full navigation is correct here:
 * the target (/c/{inquiryId}) is a bigger window onto the SAME thread, so a hard
 * navigation — not a client transition inside the popup — is the right model.
 *
 * Two presentations (strategy §10 "escalate the container with intent"):
 *   • emphasize (an offer/booking exists in the thread) → a FILLED accent
 *     button, pulling the guest into the full surface where the money/booking
 *     cards live.
 *   • otherwise → a subtle, low-emphasis text link in the panel footer.
 *
 * House rule: the accent is the tenant's brand color (resolved upstream to
 * DEFAULT_ACCENT when the tenant has none) — never black/gold. readableOn keeps
 * the filled-button label legible on any accent.
 */

import { C, FONT, readableOn } from "./mini-chat-styles";

export type OpenFullConversationLinkProps = {
  /** Target URL — the panel computes /c/{inquiryId} from its inquiryId. */
  href: string;
  /** Tenant brand accent (already resolved to DEFAULT_ACCENT when null upstream). */
  accent: string;
  /** True when an offer/booking is present → render the filled accent button. */
  emphasize?: boolean;
};

export function OpenFullConversationLink({
  href,
  accent,
  emphasize = false,
}: OpenFullConversationLinkProps) {
  if (emphasize) {
    const ink = readableOn(accent);
    return (
      <a
        href={href}
        style={{
          display: "block",
          textAlign: "center",
          padding: "11px 14px",
          borderTop: `1px solid ${C.borderSoft}`,
          background: accent,
          color: ink,
          fontFamily: FONT,
          fontSize: 12.5,
          fontWeight: 700,
          letterSpacing: 0.2,
          textDecoration: "none",
        }}
      >
        Open full conversation ↗
      </a>
    );
  }

  return (
    <a
      href={href}
      style={{
        display: "block",
        textAlign: "center",
        padding: "8px 14px",
        borderTop: `1px solid ${C.borderSoft}`,
        background: C.surfaceFaint,
        color: C.inkMuted,
        fontFamily: FONT,
        fontSize: 11.5,
        fontWeight: 600,
        textDecoration: "none",
      }}
    >
      Open full conversation ↗
    </a>
  );
}
