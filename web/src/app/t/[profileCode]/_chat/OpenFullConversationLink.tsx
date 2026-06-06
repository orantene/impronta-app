"use client";

/**
 * OpenFullConversationLink — U1 (Mini→Full Messages expansion, Lane C / F4).
 *
 * Repurposed in F4 to be an in-place EXPAND toggle rather than a hard-nav link.
 * When `onExpand` is provided, renders a BUTTON that grows the panel into the
 * 2-pane expanded layout without navigating away (URL unchanged). When the panel
 * is already expanded, the same button acts as a COLLAPSE toggle.
 *
 * The href/<a> path is kept as a FALLBACK so callers that do NOT pass onExpand
 * (e.g. GuestAccountToolkit — unchanged) continue to render a plain link. This
 * means NO breakage for any existing usage.
 *
 * Two presentations:
 *   • emphasize (an offer/booking exists) → FILLED accent button (primary CTA).
 *   • otherwise → subtle footer text / button.
 *
 * House rule: accent = tenant brand color (resolved to DEFAULT_ACCENT upstream)
 * — never black/gold. readableOn keeps labels legible on any accent.
 */

import { C, FONT, readableOn } from "./mini-chat-styles";

export type OpenFullConversationLinkProps = {
  /**
   * Target URL for the hard-nav fallback path (when onExpand is NOT provided).
   * The panel self-computes /c/{inquiryId}; this is back-compat / override only.
   * Must be provided when onExpand is absent.
   */
  href?: string;
  /** Tenant brand accent (already resolved to DEFAULT_ACCENT when null upstream). */
  accent: string;
  /** True when an offer/booking is present → render the filled accent button. */
  emphasize?: boolean;
  /**
   * When provided, clicking renders an in-place toggle (no navigation).
   * Supersedes href when set. MiniChatPanel passes onToggleExpand here.
   * GuestAccountToolkit passes nothing → falls back to href/<a>.
   */
  onExpand?: () => void;
  /**
   * Whether the panel is currently expanded. Only relevant when onExpand is set.
   * Drives label: "Expand ⤢" vs "Collapse".
   */
  expanded?: boolean;
};

export function OpenFullConversationLink({
  href,
  accent,
  emphasize = false,
  onExpand,
  expanded = false,
}: OpenFullConversationLinkProps) {
  // ── In-place expand/collapse toggle (F4 primary path) ────────────────────
  if (onExpand) {
    const label = expanded ? "Collapse ✕" : "Expand ⤢";

    if (emphasize) {
      const ink = readableOn(accent);
      return (
        <button
          type="button"
          onClick={onExpand}
          style={{
            display: "block",
            width: "100%",
            textAlign: "center",
            padding: "11px 14px",
            borderTop: `1px solid ${C.borderSoft}`,
            background: accent,
            color: ink,
            fontFamily: FONT,
            fontSize: 12.5,
            fontWeight: 700,
            letterSpacing: 0.2,
            border: "none",
            cursor: "pointer",
          }}
        >
          {label}
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={onExpand}
        style={{
          display: "block",
          width: "100%",
          textAlign: "center",
          padding: "8px 14px",
          borderTop: `1px solid ${C.borderSoft}`,
          background: C.surfaceFaint,
          color: C.inkMuted,
          fontFamily: FONT,
          fontSize: 11.5,
          fontWeight: 600,
          border: "none",
          cursor: "pointer",
        }}
      >
        {label}
      </button>
    );
  }

  // ── Hard-nav fallback (href path — unchanged; GuestAccountToolkit uses this) ─
  if (!href) return null;

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
