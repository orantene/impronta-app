/**
 * Phase 13 — WCAG contrast ratio for the theme drawer.
 *
 * Pure utility: takes two hex/rgb color strings and returns the WCAG
 * 2.1 contrast ratio (1..21). Used by the contrast-checker UI in the
 * Theme Drawer Colors tab to flag low-contrast token pairs (e.g.
 * primary text over the brand background).
 *
 * Implementation follows the WCAG formula exactly:
 *   relative luminance L = 0.2126 R + 0.7152 G + 0.0722 B
 *   where each channel is gamma-corrected sRGB.
 *   ratio = (max(L1,L2) + 0.05) / (min(L1,L2) + 0.05)
 *
 * Thresholds:
 *   AA  small text:  4.5
 *   AA  large text:  3.0
 *   AAA small text:  7.0
 *   AAA large text:  4.5
 */

function parseHex(input: string): [number, number, number] | null {
  const s = input.trim().replace(/^#/, "");
  if (s.length === 3) {
    return [
      parseInt(s[0] + s[0], 16),
      parseInt(s[1] + s[1], 16),
      parseInt(s[2] + s[2], 16),
    ];
  }
  if (s.length === 6) {
    return [
      parseInt(s.slice(0, 2), 16),
      parseInt(s.slice(2, 4), 16),
      parseInt(s.slice(4, 6), 16),
    ];
  }
  return null;
}

function parseRgb(input: string): [number, number, number] | null {
  const m = input.match(/rgb\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)/i);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function parseColor(value: string): [number, number, number] | null {
  if (!value) return null;
  if (value.startsWith("#")) return parseHex(value);
  if (value.startsWith("rgb")) return parseRgb(value);
  return parseHex(value);
}

function srgbChannel(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map(srgbChannel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(fg: string, bg: string): number | null {
  const fgRgb = parseColor(fg);
  const bgRgb = parseColor(bg);
  if (!fgRgb || !bgRgb) return null;
  const Lf = relativeLuminance(fgRgb);
  const Lb = relativeLuminance(bgRgb);
  const lighter = Math.max(Lf, Lb);
  const darker = Math.min(Lf, Lb);
  return (lighter + 0.05) / (darker + 0.05);
}

export type ContrastVerdict = "fail" | "aa-large" | "aa" | "aaa";

export function classifyContrast(ratio: number | null): ContrastVerdict {
  if (ratio == null || ratio < 3) return "fail";
  if (ratio < 4.5) return "aa-large";
  if (ratio < 7) return "aa";
  return "aaa";
}
