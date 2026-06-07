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
  guestBubble: "#33507a",
  guestBubbleInk: "#ffffff",
  systemInk: "#6b7280",
  danger: "#a13a3a",
} as const;

// Default accent (used for the launcher, send button, and the guest's own
// message bubble when a tenant has NOT set a brand color). House rule: NEVER
// black or gold/rust on small components — a cool, premium slate-blue stands in
// for the brand color so nothing falls back to a near-black fill.
export const DEFAULT_ACCENT = "#33507a";

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

/** Split a stored full name into gate first/last fields (prefill resume). */
export function splitGuestFullName(name: string | null | undefined): {
  firstName: string;
  lastName: string;
} {
  const t = (name ?? "").trim();
  if (!t) return { firstName: "", lastName: "" };
  const parts = t.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0] ?? "", lastName: "" };
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

/** Combine gate fields into profiles.display_name / inquiries.contact_name. */
export function joinGuestDisplayName(firstName: string, lastName: string): string {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
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

// ─────────────────────────────────────────────────────────────────────────────
// Expanded 2-pane mode — dimension constants (Lane C / F4).
// Accent drives active indicators; NO gold/rust (house rule).
// ─────────────────────────────────────────────────────────────────────────────

/** Width of the expanded 2-pane panel. */
export const EXPANDED_WIDTH = "min(720px, calc(100vw - 32px))";
/** Max-height of the expanded 2-pane panel. */
export const EXPANDED_MAX_HEIGHT = "min(680px, calc(100vh - 100px))";
/** Fixed width of the left conversation-list pane when expanded. */
export const LEFT_PANE_WIDTH = 232;

/** Shared shell style for the 2-pane outer container. Applied by ExpandedChatLayout. */
export const expandedShellStyle: CSSProperties = {
  position: "fixed",
  right: "max(16px, env(safe-area-inset-right))",
  bottom: "calc(84px + env(safe-area-inset-bottom))",
  zIndex: 90,
  width: EXPANDED_WIDTH,
  maxHeight: EXPANDED_MAX_HEIGHT,
  display: "flex",
  flexDirection: "column",
  background: C.surface,
  borderRadius: 18,
  border: `1px solid ${C.border}`,
  boxShadow:
    "0 24px 60px -18px rgba(16,18,29,0.45), 0 6px 18px -8px rgba(16,18,29,0.25)",
  overflow: "hidden",
  fontFamily: FONT,
};

/** Style for the left conversation-list pane in expanded mode. */
export const leftPaneStyle: CSSProperties = {
  width: LEFT_PANE_WIDTH,
  flexShrink: 0,
  borderRight: `1px solid ${C.borderSoft}`,
  display: "flex",
  flexDirection: "column",
  overflowY: "auto",
  background: C.surfaceFaint,
};

/** Style for the right thread pane in expanded mode. */
export const rightPaneStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

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
