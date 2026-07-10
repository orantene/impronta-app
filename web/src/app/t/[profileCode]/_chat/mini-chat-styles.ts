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

// Jon 360 Phase 7 — a tiny two-axis type scale. Body copy stays system-sans
// (FONT, above). The DISPLAY axis is the editorial serif the public directory
// (editorial-noir) heading vocabulary already loads at the app root
// (`--font-fraunces` / `--font-playfair-display`, see web/src/app/layout.tsx).
// Used ONLY for the agency identity + headings (header name, greeting, receipt
// title), never for body text. Falls back to a system serif when the vars are
// absent (non-storefront hosts), so it degrades to a clean serif, never a box.
export const FONT_DISPLAY =
  'var(--font-fraunces, var(--font-playfair-display, "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, ui-serif, serif))';

/** Two-axis type scale. `body` = the existing system-sans string; `display`
 *  = the editorial serif for agency identity + headings. */
export const TYPE = {
  body: FONT,
  display: FONT_DISPLAY,
} as const;

export const C = {
  ink: "#16181d",
  inkMuted: "#5b6170",
  // inkDim is used for meaningful text (unsaved hints, retry/error copy, optional
  // pills). Darkened from the original #9aa0ad (~2.6:1, a WCAG 1.4.3 AA failure)
  // to clear >=4.5:1 on BOTH #ffffff (4.97:1) and C.surfaceFaint #f6f7f9 (4.64:1),
  // so every dim text instance is now AA-legible without per-call-site changes.
  inkDim: "#6a707d",
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

// ─────────────────────────────────────────────────────────────────────────────
// Jon 360 Phase 7 — DARK surface variant. The public directory ships an
// editorial-NOIR theme for the Impronta tenant, yet the chat panel rendered as a
// bright near-white card on that black canvas (a visual mismatch + a launcher
// that pops a white box on a dark page). C_DARK mirrors C key-for-key with values
// that read on a near-black surface: every `ink*` clears >=4.5:1 on `surface`
// (verified below), tints/borders use light-alpha so they composite on dark.
// The LIGHT `C` above is left BYTE-IDENTICAL so light tenants are unchanged.
// ─────────────────────────────────────────────────────────────────────────────

export type SurfaceMode = "light" | "dark";

/** The shape both the light (`C`) and dark (`C_DARK`) palettes satisfy. Use this
 *  (not `typeof C`) for palette params so the two palettes are interchangeable. */
export type Palette = { readonly [K in keyof typeof C]: string };

export const C_DARK: Palette = {
  // #ededf0 on #15161a ≈ 13.8:1; #aeb3bf on #15161a ≈ 7.1:1 — both clear AA.
  ink: "#ededf0",
  inkMuted: "#aeb3bf",
  // inkDim carries meaningful text (save hints, optional pills). #9aa1ad on the
  // base surface #15161a ≈ 5.6:1 and on surfaceFaint #1d1f25 ≈ 5.0:1 — AA on both.
  inkDim: "#9aa1ad",
  surface: "#15161a",
  surfaceFaint: "#1d1f25",
  surfaceCool: "#23262e",
  border: "rgba(255,255,255,0.14)",
  borderSoft: "rgba(255,255,255,0.09)",
  // The guest's own bubble keeps a saturated slate that reads on dark; ink stays
  // white. (Accent-driven bubbles still clamp through accentText/readableOn.)
  guestBubble: "#4d6fa6",
  guestBubbleInk: "#ffffff",
  systemInk: "#9aa1ad",
  // Brighter rust that clears AA on the dark surface (the light #a13a3a does not).
  danger: "#f08a8a",
} as const;

/** Resolve the active C palette for a surface mode. Default `light` returns the
 *  exact same `C` object reference, so the light path is unchanged. */
export function paletteFor(mode: SurfaceMode | undefined): Palette {
  return mode === "dark" ? C_DARK : C;
}

// Owner decision 2026-06-27: the chat keeps the LIGHT surface on EVERY tenant
// (the dark variant read as too harsh on the eyes). This set is intentionally
// EMPTY so surfaceModeFromBackgroundMode always resolves to "light"; the dark
// palette (C_DARK) and the surfaceMode threading stay in place, dormant, so a
// dark option can be re-enabled later just by re-adding the noir mode tokens.
const DARK_BACKGROUND_MODES = new Set<string>([]);

/**
 * Derive the chat surfaceMode from a tenant's resolved `background.mode` token
 * (resolveDesignTokens(branding)["background.mode"]). Anything not in the dark
 * set (incl. undefined / plain / ivory) → "light", so the default is safe.
 */
export function surfaceModeFromBackgroundMode(
  backgroundMode: string | null | undefined,
): SurfaceMode {
  return backgroundMode && DARK_BACKGROUND_MODES.has(backgroundMode) ? "dark" : "light";
}

// Default accent (used for the launcher, send button, and the guest's own
// message bubble when a tenant has NOT set a brand color). House rule: NEVER
// black or gold/rust on small components — a cool, premium slate-blue stands in
// for the brand color so nothing falls back to a near-black fill.
export const DEFAULT_ACCENT = "#33507a";

/** Launcher pill offset from the viewport bottom (safe-area added at use site). */
export const GUEST_CHAT_LAUNCHER_BOTTOM_PX = 130;
/** Mini / expanded panel offset — sits above the launcher pill. */
export const GUEST_CHAT_PANEL_BOTTOM_PX = 194;

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

// ─────────────────────────────────────────────────────────────────────────────
// Accent-as-text contrast clamp (a11y). `readableOn` only governs ink ON a SOLID
// accent fill. When the accent itself is used as TEXT/GLYPH on a light surface or
// a pale accent tint (filled chips, selected-talent chips, rail icons), a bright
// tenant accent — Impronta ships GOLD — drops well below the 4.5:1 AA floor. These
// helpers parse the accent, measure its contrast, and DARKEN it until it clears
// the floor (falling back to C.ink), so no tenant accent can ship sub-4.5:1 text.
// ─────────────────────────────────────────────────────────────────────────────

type Rgb = { r: number; g: number; b: number };

function parseHex(hex: string | null | undefined): Rgb | null {
  if (!hex || typeof hex !== "string") return null;
  const m = hex.trim().replace(/^#/, "");
  const full =
    m.length === 3
      ? m
          .split("")
          .map((c) => c + c)
          .join("")
      : m;
  if (full.length !== 6) return null;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return { r, g, b };
}

function toHex({ r, g, b }: Rgb): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function relLuminance({ r, g, b }: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two parsed colors. */
function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

const AA_TEXT = 4.5;

/**
 * accentText — a guaranteed >=4.5:1 text/glyph color derived from the tenant
 * accent, for use as foreground on a light background (default white). If the raw
 * accent already passes against `bg`, it is returned unchanged (the slate default
 * passes); otherwise it is darkened toward black in small steps until it clears
 * the AA floor, falling back to C.ink if even near-black would not (never happens
 * for a 4.5:1 target on a light bg, but the guard keeps the contract total).
 *
 * Tints like `${accent}15` composite over the surface, so measuring against the
 * solid light surface is the conservative (worst-case) bound for chip/rail labels.
 */
export function accentText(accent: string, bg: string = C.surface): string {
  const fg = parseHex(accent);
  const bgRgb = parseHex(bg) ?? { r: 255, g: 255, b: 255 };
  if (!fg) return C.ink;
  if (contrastRatio(fg, bgRgb) >= AA_TEXT) return accent;
  // Darken toward black, preserving hue, until the floor is met.
  let cur = { ...fg };
  for (let i = 0; i < 24; i += 1) {
    cur = { r: cur.r * 0.9, g: cur.g * 0.9, b: cur.b * 0.9 };
    if (contrastRatio(cur, bgRgb) >= AA_TEXT) return toHex(cur);
  }
  return C.ink;
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

/** Minimal translator shape — a `createTranslator(locale)` instance satisfies it. */
type Translator = (key: string) => string;

/** Maps a guest thread status → its i18n key under `public.guestChat.*`. */
const STATUS_COPY_KEYS: Record<GuestThreadStatus, string> = {
  // A draft the guest is actively composing reads as an open conversation in the
  // panel subtitle (the panel is literally open). Reuses the existing key rather
  // than inventing draft copy — the launcher PILL is where draft-vs-sent matters,
  // and that reads from the resolver, not this map (W0-B).
  draft: "public.guestChat.statusOpen",
  open: "public.guestChat.statusOpen",
  offer_pending: "public.guestChat.statusOfferPending",
  approved: "public.guestChat.statusApproved",
  booked: "public.guestChat.statusBooked",
  closed: "public.guestChat.statusClosed",
};

/** Localized thread-status copy. Pass a `createTranslator(locale)` instance. */
export function statusCopy(status: GuestThreadStatus, t: Translator): string {
  return t(STATUS_COPY_KEYS[status]);
}

// Every GuestMessageKind resolves to a localized label, including the now
// first-class `booking_confirmed` / `balance_due` / `voice` kinds and the
// `system_event` kind (all previously fell through to a generic "Update").
// `text` still uses the generic update label (it never renders a card chip in
// practice). `voice` renders as a labelled card chip — the guest contract does
// not plumb the signed audio URL, so the mini-chat shows a clear "Voice note"
// affordance rather than the full VoiceNotePlayer (a fast-follow per the
// contract's card-rendering note).
export function labelForKind(kind: GuestMessageKind, t: Translator): string {
  switch (kind) {
    case "offer_event":
      return t("public.guestChat.kindOffer");
    case "payment_request":
      return t("public.guestChat.kindPaymentRequested");
    case "payment_paid":
      return t("public.guestChat.kindPaymentReceived");
    case "coordinator_request":
      return t("public.guestChat.kindCoordinator");
    case "talent_rate":
      return t("public.guestChat.kindRate");
    case "call_sheet_update":
      return t("public.guestChat.kindCallSheet");
    case "booking_status":
      return t("public.guestChat.kindBooking");
    case "booking_confirmed":
      return t("public.guestChat.kindBookingConfirmed");
    case "balance_due":
      return t("public.guestChat.kindBalanceDue");
    case "voice":
      return t("public.guestChat.kindVoice");
    case "system_event":
      return t("public.guestChat.kindSystemEvent");
    default:
      return t("public.guestChat.kindUpdate");
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

/** Shared shell style for the 2-pane outer container. Applied by ExpandedChatLayout.
 *  Pass a palette (paletteFor(surfaceMode)) for the dark variant; defaults to light
 *  so existing call sites are unchanged. */
export function expandedShellStyle(p: Palette = C): CSSProperties {
  return {
    position: "fixed",
    right: "max(16px, env(safe-area-inset-right))",
    bottom: `calc(${GUEST_CHAT_PANEL_BOTTOM_PX}px + env(safe-area-inset-bottom))`,
    zIndex: 90,
    width: EXPANDED_WIDTH,
    maxHeight: EXPANDED_MAX_HEIGHT,
    display: "flex",
    flexDirection: "column",
    background: p.surface,
    borderRadius: 18,
    border: `1px solid ${p.border}`,
    boxShadow:
      "0 24px 60px -18px rgba(16,18,29,0.45), 0 6px 18px -8px rgba(16,18,29,0.25)",
    overflow: "hidden",
    fontFamily: FONT,
  };
}

/** Style for the left conversation-list pane in expanded mode. */
export function leftPaneStyle(p: Palette = C): CSSProperties {
  return {
    width: LEFT_PANE_WIDTH,
    flexShrink: 0,
    borderRight: `1px solid ${p.borderSoft}`,
    display: "flex",
    flexDirection: "column",
    overflowY: "auto",
    background: p.surfaceFaint,
  };
}

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

/** Palette-aware input style (Jon 360 Phase 7). Default returns the byte-identical
 *  light `inputStyle`; pass a dark palette for noir tenants. */
export function inputStyleFor(p: Palette = C): CSSProperties {
  return {
    flex: 1,
    minWidth: 0,
    padding: "9px 11px",
    borderRadius: 9,
    border: `1px solid ${p.borderSoft}`,
    background: p.surfaceCool,
    fontFamily: FONT,
    fontSize: 13,
    color: p.ink,
    outline: "none",
    boxSizing: "border-box",
  };
}

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
