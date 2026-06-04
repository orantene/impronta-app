/**
 * mini-chat-styles.ts — design tokens, style helpers, and small pure utils for
 * the talent-profile guest-chat popup (Lane D). Split out of MiniChatPanel.tsx
 * to keep that file under the project max-lines cap and to share the brand-skin
 * tokens with the message-bubble sub-component.
 *
 * House rule: NO gold/rust accents hard-coded. The one warm/brand value is the
 * injected accentColor (the tenant's own agency_branding color), applied at
 * runtime — everything here is cool + neutral.
 */

import type { CSSProperties } from "react";

import type { GuestMessageKind, GuestThreadStatus } from "@/lib/inquiry/guest-chat-contract";

export const FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export const C = {
  ink: "#16181d",
  inkMuted: "#5b6170",
  inkDim: "#9aa0ad",
  surface: "#ffffff",
  surfaceFaint: "#f6f7f9",
  surfaceCool: "#eef1f5",
  border: "rgba(20,24,31,0.12)",
  borderSoft: "rgba(20,24,31,0.08)",
  guestBubble: "#16181d",
  guestBubbleInk: "#ffffff",
  systemInk: "#6b7280",
  danger: "#a13a3a",
} as const;

export const DEFAULT_ACCENT = "#16181d";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Readable text color for a hex accent (so the send button label stays legible
 * on both a near-black brand color and a bright one). Falls back to white.
 */
export function readableOn(hex: string | null | undefined): string {
  if (!hex || typeof hex !== "string") return "#ffffff";
  const m = hex.trim().replace(/^#/, "");
  const full =
    m.length === 3
      ? m
          .split("")
          .map((c) => c + c)
          .join("")
      : m;
  if (full.length !== 6) return "#ffffff";
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return "#ffffff";
  // Relative luminance (sRGB approximation).
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? "#16181d" : "#ffffff";
}

export function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function firstNameOf(name: string): string {
  const t = name.trim();
  if (!t) return name;
  return t.split(/\s+/)[0] ?? t;
}

export const STATUS_COPY: Record<GuestThreadStatus, string> = {
  open: "Open conversation",
  offer_pending: "You have an offer",
  approved: "Approved",
  booked: "Booked",
  closed: "Closed",
};

export function labelForKind(kind: GuestMessageKind): string {
  switch (kind) {
    case "offer_event":
      return "Offer";
    case "payment_request":
      return "Payment requested";
    case "payment_paid":
      return "Payment received";
    case "coordinator_request":
      return "Coordinator";
    case "talent_rate":
      return "Rate";
    case "call_sheet_update":
      return "Call sheet";
    case "booking_status":
      return "Booking";
    default:
      return "Update";
  }
}

export const inputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: "9px 11px",
  borderRadius: 9,
  border: `1px solid ${C.borderSoft}`,
  background: C.surface,
  fontFamily: FONT,
  fontSize: 13,
  color: C.ink,
  outline: "none",
  boxSizing: "border-box",
};

export function primaryBtnStyle(accent: string, ink: string): CSSProperties {
  return {
    height: 38,
    borderRadius: 10,
    background: accent,
    color: ink,
    border: "none",
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: 600,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "opacity 120ms, background 120ms",
    flexShrink: 0,
  };
}
