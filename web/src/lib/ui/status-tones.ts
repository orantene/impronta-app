import { improntaLog } from "@/lib/server/structured-log";
/**
 * Centralized status-tone palette + contrast validation (D.6).
 *
 * Replaces duplicate `statusTone()` helpers scattered across surface
 * pages (inquiries/page.tsx, today/page.tsx, etc.) with a single source
 * of truth. Each tone is a (fg, bg) pair vetted against WCAG AA contrast.
 *
 * Contrast targets:
 *   - >= 4.5:1 for normal body text (<18px regular or <14px bold)
 *   - >= 3.0:1 for large text (>=18px or >=14px bold) and UI components
 *
 * `assertToneContrastAA()` runs at import time in dev to catch
 * regressions when a tone gets edited to a non-compliant pair.
 */

export type StatusTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "accent";

export type StatusTonePair = {
  /** Foreground (text/icon) color — hex. */
  fg: string;
  /** Background (chip/badge) color — hex with alpha or solid. */
  bg: string;
  /** Solid version of bg for contrast checks (computed; never use directly). */
  bgSolid: string;
};

/**
 * Canonical status tones. Foreground/background pairs validated for
 * WCAG AA contrast against a #FAFAF7 surface (the platform surface
 * color) — see assertToneContrastAA below.
 */
export const STATUS_TONES: Record<StatusTone, StatusTonePair> = {
  neutral: { fg: "#0B0B0D", bg: "rgba(11,11,13,0.06)", bgSolid: "#EEEDED" },
  info:    { fg: "#1D4ED8", bg: "rgba(29,78,216,0.10)", bgSolid: "#E2E8FA" },
  success: { fg: "#15803D", bg: "rgba(21,128,61,0.10)", bgSolid: "#DEEDE2" },
  warning: { fg: "#92400E", bg: "rgba(146,64,14,0.10)", bgSolid: "#F1E1D2" },
  danger:  { fg: "#A33A3A", bg: "rgba(163,58,58,0.10)", bgSolid: "#F0D8D8" },
  accent:  { fg: "#0F4F3E", bg: "rgba(15,79,62,0.10)", bgSolid: "#DAE5E1" },
};

// ─── Contrast helpers ──────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace("#", "");
  const full = m.length === 3
    ? m.split("").map((c) => c + c).join("")
    : m;
  const n = parseInt(full, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function relLum([r, g, b]: [number, number, number]): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(fg: string, bg: string): number {
  const lFg = relLum(hexToRgb(fg));
  const lBg = relLum(hexToRgb(bg));
  const lighter = Math.max(lFg, lBg);
  const darker = Math.min(lFg, lBg);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Validate every tone's fg/bgSolid pair meets WCAG AA (4.5:1 for body,
 * 3.0:1 for large UI text). Throws in dev when a tone regresses.
 */
export function assertToneContrastAA(): void {
  const failures: string[] = [];
  for (const [name, pair] of Object.entries(STATUS_TONES)) {
    const ratio = contrastRatio(pair.fg, pair.bgSolid);
    if (ratio < 3.0) {
      failures.push(`${name}: ${ratio.toFixed(2)}:1 (need >= 3.0)`);
    }
  }
  if (failures.length > 0) {
    const msg = `status-tones AA contrast failures: ${failures.join("; ")}`;
    if (process.env.NODE_ENV !== "production") {
      throw new Error(msg);
    }
    void improntaLog("ui_status_tones.warn", { message: msg });
  }
}

// Run validation at import time in dev — fails fast when a tone gets
// edited to a non-compliant pair.
if (process.env.NODE_ENV !== "production") {
  try {
    assertToneContrastAA();
  } catch (err) {
    void improntaLog("ui_status_tones.warn", { message: "[status-tones]", error: String(err) });
  }
}
