/**
 * Reservation Thread — design tokens.
 *
 * One palette per POV, shared geometry. Per §4.2 of the audit:
 *   admin = ink + warm gold
 *   talent / talent_coord = ink + sage
 *   client = ink + warm blue
 *
 * Geometry tokens (radii, density, type sizes) are POV-agnostic.
 */

import type { ReservationPov, PillTone } from "./types";

export const RADII = {
  pill: 999,
  bubble: 14,
  card: 12,
  sheet: 18,
} as const;

export const DENSITY = {
  headerHeight: 40,
  quickStripHeight: 36,
  composerMinHeight: 56,
  actionRowHeight: 44,
  pillPadX: 12,
  pillPadY: 6,
  pillFontSize: 12,
  pillGap: 8,
} as const;

export const TYPE = {
  bodyFamily: '"Inter", system-ui, sans-serif',
  displayFamily: '"Domaine Display", "Playfair Display", serif',
  bubbleSize: 13.5,
  bubbleLine: 1.45,
  metaSize: 11,
} as const;

interface PovPalette {
  ink: string;
  inkMuted: string;
  inkDim: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  borderSoft: string;
  /** POV-specific accent. */
  accent: string;
  accentSoft: string;
  accentDeep: string;
  /** Tonal status palette — shared across POVs but the accent shifts. */
  ok: string;
  okSoft: string;
  warn: string;
  warnSoft: string;
  alert: string;
  alertSoft: string;
  info: string;
  infoSoft: string;
}

const SHARED_INK: Pick<
  PovPalette,
  | "ink"
  | "inkMuted"
  | "inkDim"
  | "surface"
  | "surfaceRaised"
  | "border"
  | "borderSoft"
  | "ok"
  | "okSoft"
  | "warn"
  | "warnSoft"
  | "alert"
  | "alertSoft"
  | "info"
  | "infoSoft"
> = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.62)",
  inkDim: "rgba(11,11,13,0.38)",
  surface: "#FCFBF7",
  surfaceRaised: "#FFFFFF",
  border: "rgba(11,11,13,0.10)",
  borderSoft: "rgba(11,11,13,0.06)",
  ok: "#2A6B3F",
  okSoft: "rgba(42,107,63,0.10)",
  warn: "#8A5A12",
  warnSoft: "rgba(138,90,18,0.10)",
  alert: "#9A2B2B",
  alertSoft: "rgba(154,43,43,0.10)",
  info: "#22517A",
  infoSoft: "rgba(34,81,122,0.10)",
};

export const PALETTES: Record<ReservationPov, PovPalette> = {
  admin: {
    ...SHARED_INK,
    accent: "#7A5B1F",         // warm gold
    accentSoft: "rgba(122,91,31,0.10)",
    accentDeep: "#4F3C13",
  },
  talent: {
    ...SHARED_INK,
    accent: "#3D6B4F",         // sage
    accentSoft: "rgba(61,107,79,0.10)",
    accentDeep: "#244531",
  },
  talent_coord: {
    ...SHARED_INK,
    accent: "#3D6B4F",
    accentSoft: "rgba(61,107,79,0.10)",
    accentDeep: "#244531",
  },
  client: {
    ...SHARED_INK,
    accent: "#22517A",         // warm blue
    accentSoft: "rgba(34,81,122,0.10)",
    accentDeep: "#143553",
  },
};

/** Map pill tone → status palette pair (text + background). */
export function pillToneColors(pov: ReservationPov, tone: PillTone | undefined): { fg: string; bg: string } {
  const p = PALETTES[pov];
  switch (tone) {
    case "ok":     return { fg: p.ok,    bg: p.okSoft };
    case "warn":   return { fg: p.warn,  bg: p.warnSoft };
    case "alert":  return { fg: p.alert, bg: p.alertSoft };
    case "info":   return { fg: p.info,  bg: p.infoSoft };
    case "neutral":
    default:       return { fg: p.inkMuted, bg: p.borderSoft };
  }
}

/** Mobile breakpoint — single source-of-truth so the primitive and any
 *  consumers (custom sheets, composer-row variants) agree on what
 *  "mobile" means. Matches the existing admin shell `@media (max-width:
 *  720px)` rules so we don't introduce a third breakpoint scale. */
export const MOBILE_BP_PX = 720;
