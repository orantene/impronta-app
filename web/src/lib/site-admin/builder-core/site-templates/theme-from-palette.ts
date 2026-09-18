/**
 * theme-from-palette.ts — recolour a Look's theme patch from the owner's
 * brand colours (`brand.palette`, unlabelled hexes).
 *
 * Roles are guessed by luminance and saturation: the most saturated colour is
 * the primary candidate, the next the accent. A candidate that fails contrast
 * against the Look's canvas is DEMOTED to accent (or dropped), never refused,
 * and the canvas/ink stay the Look's own so readability never depends on the
 * owner's palette (fact-keys.ts comment on `brand.palette`; theme contract).
 * Pure; the result still goes through `validateThemePatch`.
 */

import { contrastRatio, foregroundForPrimary } from "@/lib/site-admin/tokens/contrast-pair";

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const MIN_PRIMARY_CONTRAST = 3; // large text / UI components against the canvas

function expand(hex: string): string {
  const h = hex.trim().toLowerCase();
  return h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h;
}

function saturation(hex: string): number {
  const h = expand(hex).slice(1);
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return (max - min) / max;
}

export function themePatchFromPalette(
  base: Readonly<Record<string, string>>,
  palette: ReadonlyArray<string>,
): { patch: Record<string, string>; used: string[]; demoted: string[] } {
  const patch: Record<string, string> = { ...base };
  const used: string[] = [];
  const demoted: string[] = [];
  const hexes = palette.map((p) => p.trim()).filter((p) => HEX_RE.test(p)).map(expand);
  if (hexes.length === 0) return { patch, used, demoted };
  const canvas = base["color.background"] ?? "#ffffff";

  const ranked = [...new Set(hexes)].sort((a, b) => saturation(b) - saturation(a));
  let primaryDone = false;
  let accentDone = false;
  for (const hex of ranked) {
    const ratio = contrastRatio(hex, canvas) ?? 0;
    if (!primaryDone && ratio >= MIN_PRIMARY_CONTRAST) {
      patch["color.primary"] = hex;
      const on = foregroundForPrimary(hex);
      if (on) patch["color.primary-on"] = on;
      used.push(hex);
      primaryDone = true;
      continue;
    }
    if (!accentDone) {
      patch["color.accent"] = hex;
      used.push(hex);
      accentDone = true;
      if (!primaryDone && ratio < MIN_PRIMARY_CONTRAST) demoted.push(`${hex} → accent (contrast ${ratio.toFixed(2)} on ${canvas})`);
      continue;
    }
    demoted.push(`${hex} unused`);
  }
  // `color.primary-on` is derived by the renderer and not agency-configurable;
  // keep the patch to registry-accepted keys.
  delete patch["color.primary-on"];
  return { patch, used, demoted };
}

// ── Candidate palettes for the owner's choice (decision-1 follow-up) ────────

export interface CandidatePalette {
  /** Stable id for the choice UI (`p1`…`p3`). */
  id: string;
  /** The hexes this candidate is built from, in the order they were read. */
  swatches: string[];
  /** The registry-accepted patch a compose/retheme would apply. */
  patch: Record<string, string>;
  /** Why a swatch was demoted or dropped, in plain words; empty = clean. */
  demotions: string[];
  /** The primary this candidate ends up with (the Look's own when none qualified). */
  primary: string;
}

/**
 * Up to three palette candidates from the hexes a logo (or the owner) gave,
 * each ≤ 3 swatches, each with its demotions spelled out, so the owner picks
 * and nothing rethemes on upload (owner logo rule 2026-09-16). Candidate 1 is
 * the saturation ranking `themePatchFromPalette` would use; candidate 2 leads
 * with the darkest colour; candidate 3 with the second most saturated. Pure.
 */
export function candidatePalettesFromHexes(base: Readonly<Record<string, string>>, hexes: ReadonlyArray<string>): CandidatePalette[] {
  const clean = [...new Set(hexes.map((h) => h.trim()).filter((h) => HEX_RE.test(h)).map(expand))];
  if (clean.length === 0) return [];
  const bySaturation = [...clean].sort((a, b) => saturation(b) - saturation(a));
  const byDarkness = [...clean].sort((a, b) => luminanceOf(a) - luminanceOf(b));
  const orders: string[][] = [bySaturation.slice(0, 3)];
  if (byDarkness[0] !== bySaturation[0]) orders.push([byDarkness[0], ...bySaturation.filter((h) => h !== byDarkness[0])].slice(0, 3));
  if (bySaturation.length > 1) orders.push([bySaturation[1], ...bySaturation.filter((h) => h !== bySaturation[1])].slice(0, 3));
  const seen = new Set<string>();
  const out: CandidatePalette[] = [];
  for (const swatches of orders) {
    const key = swatches.join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    const mapped = themePatchFromPalette(base, swatches);
    out.push({ id: `p${out.length + 1}`, swatches, patch: mapped.patch, demotions: mapped.demoted, primary: mapped.patch["color.primary"] ?? base["color.primary"] ?? "" });
    if (out.length === 3) break;
  }
  return out;
}

function luminanceOf(hex: string): number {
  const h = expand(hex).slice(1);
  const ch = (i: number) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(0) + 0.7152 * ch(2) + 0.0722 * ch(4);
}
