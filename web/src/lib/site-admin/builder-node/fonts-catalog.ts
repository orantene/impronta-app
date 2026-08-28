/**
 * fonts-catalog.ts — typed access to the FULL Google Fonts catalogue.
 *
 * The data lives in `google-fonts-catalog.json`, a checked-in file generated
 * by `scripts/generate-google-fonts-catalog.mjs` from Google's public
 * metadata feed (1,800+ latin families, popularity-sorted). Generated at
 * developer time on purpose: render and build never touch the network for
 * font METADATA, and there is no API key to manage. Font FILES still come
 * from fonts.gstatic.com at request time, exactly like the curated list
 * always has.
 *
 * WHY CLAMPING LIVES HERE
 * ───────────────────────
 * The css2 endpoint rejects the WHOLE stylesheet with a 400 when any single
 * requested weight does not exist for its family — one bad axis tuple kills
 * every font on the page. So every href built from this module clamps the
 * requested weights to what the family actually ships (nearest available
 * weight) before the URL is assembled. Families this catalogue does not know
 * (tenant-uploaded faces, typos, decorative strings) are skipped entirely —
 * they must never reach fonts.googleapis.com.
 *
 * VARIABLE FONTS ARE FIRST-CLASS
 * ──────────────────────────────
 * A family with a `wght` axis is requested as a RANGE (`wght@300..700`)
 * covering the weights in use, so the browser downloads ONE variable file
 * that serves every weight between, instead of N static instances.
 */

import catalogJson from "./google-fonts-catalog.json";
import {
  fallbackForBuilderFontCategory,
  firstFontFamily,
  resolveBuilderFont,
  type BuilderFontCategory,
} from "./fonts-registry";

export interface GoogleFontMeta {
  family: string;
  category: BuilderFontCategory;
  /** Upright static instance weights, ascending. */
  weights: number[];
  /** Italic static instance weights, ascending. Empty = no true italics. */
  italicWeights: number[];
  /** The `wght` variable-axis range, or null for a static family. */
  vf: { min: number; max: number } | null;
  /** Position in the popularity-sorted catalogue (0 = most popular). */
  rank: number;
}

const CATEGORY_BY_CODE: Record<string, BuilderFontCategory> = {
  s: "sans",
  r: "serif",
  d: "display",
  h: "script",
  m: "mono",
};

let parsed: GoogleFontMeta[] | null = null;
let byFamily: Map<string, GoogleFontMeta> | null = null;

function parseWeights(part: string): number[] {
  if (!part) return [];
  return part
    .split(" ")
    .map((w) => Number.parseInt(w, 10))
    .filter((w) => Number.isFinite(w));
}

function parseEntry(line: string, rank: number): GoogleFontMeta | null {
  const [family, code, weights, italics, vfRange] = line.split("|");
  const category = CATEGORY_BY_CODE[code];
  if (!family || !category) return null;
  let vf: GoogleFontMeta["vf"] = null;
  if (vfRange) {
    const [min, max] = vfRange.split("..").map((v) => Number.parseInt(v, 10));
    if (Number.isFinite(min) && Number.isFinite(max) && min < max) vf = { min, max };
  }
  return {
    family,
    category,
    weights: parseWeights(weights),
    italicWeights: parseWeights(italics),
    vf,
    rank,
  };
}

/** The full catalogue, popularity-sorted. Parsed once, memoized. */
export function loadGoogleFontsCatalog(): ReadonlyArray<GoogleFontMeta> {
  if (parsed) return parsed;
  const out: GoogleFontMeta[] = [];
  for (const line of (catalogJson as { families: string[] }).families) {
    const entry = parseEntry(line, out.length);
    if (entry) out.push(entry);
  }
  parsed = out;
  return out;
}

function normalize(family: string): string {
  return family.trim().replace(/^["']|["']$/g, "").toLowerCase();
}

/** Case-insensitive catalogue lookup by family name. */
export function getGoogleFontMeta(family: string): GoogleFontMeta | null {
  if (!byFamily) {
    byFamily = new Map(loadGoogleFontsCatalog().map((f) => [normalize(f.family), f]));
  }
  return byFamily.get(normalize(family)) ?? null;
}

/** A stored font-family value for a catalogue family: real fallback included. */
export function cssFamilyForGoogleFont(meta: GoogleFontMeta): string {
  return `"${meta.family}", ${fallbackForBuilderFontCategory(meta.category)}`;
}

/**
 * Clamp a wanted weight to the nearest weight the family actually ships.
 * A variable family accepts anything inside its axis range.
 */
export function clampWeightForFamily(meta: GoogleFontMeta, wanted: number): number {
  if (meta.vf) return Math.min(meta.vf.max, Math.max(meta.vf.min, wanted));
  const available = meta.weights.length > 0 ? meta.weights : meta.italicWeights;
  if (available.length === 0) return 400;
  let best = available[0];
  for (const w of available) {
    if (Math.abs(w - wanted) < Math.abs(best - wanted)) best = w;
  }
  return best;
}

/** One family's requested usage, as collected from a page or theme tokens. */
export interface GoogleFontUsageRequest {
  /** A font-family value or bare family name. Token refs / generics are skipped. */
  value: string;
  /** Weights in use. Empty falls back to [400, 700]. */
  weights?: ReadonlyArray<number>;
  /** True when the page uses genuine italics of this family. */
  italic?: boolean;
}

const DEFAULT_USAGE_WEIGHTS = [400, 700];
/** The weight set assumed for theme-token families (usage unknown site-wide). */
export const THEME_TOKEN_FONT_WEIGHTS = [400, 500, 600, 700];

/**
 * Build ONE combined css2 href for the given usage. Rules:
 *   • bundled registry faces, generic keywords, `var(…)`/`token:` refs and
 *     families this catalogue does not know (tenant uploads!) are skipped;
 *   • weights are clamped per family, deduped and sorted (css2 requires it);
 *   • variable families get a `min..max` range instead of an instance list;
 *   • italics are requested only when used AND the family truly has them;
 *   • `display=swap` always.
 */
export function buildGoogleFontsHrefFromUsage(
  requests: ReadonlyArray<GoogleFontUsageRequest>,
): string | null {
  const params: string[] = [];
  const seen = new Set<string>();

  for (const request of requests) {
    const family = firstFontFamily(request.value);
    if (!family) continue;
    const key = normalize(family);
    if (seen.has(key)) continue;
    const registryFace = resolveBuilderFont(family);
    if (registryFace?.source === "bundled") continue;
    const meta = getGoogleFontMeta(family);
    if (!meta) continue;
    seen.add(key);

    const wanted =
      request.weights && request.weights.length > 0
        ? request.weights
        : DEFAULT_USAGE_WEIGHTS;
    const clamped = [...new Set(wanted.map((w) => clampWeightForFamily(meta, w)))].sort(
      (a, b) => a - b,
    );
    const italic = Boolean(request.italic) && meta.italicWeights.length > 0;
    const encoded = encodeURIComponent(meta.family).replace(/%20/g, "+");

    let axis: string;
    if (meta.vf) {
      const min = clamped[0];
      const max = clamped[clamped.length - 1];
      const range = min === max ? `${min}` : `${min}..${max}`;
      axis = italic ? `ital,wght@0,${range};1,${range}` : `wght@${range}`;
    } else if (italic) {
      const italicClamped = [
        ...new Set(
          wanted.map((w) => {
            let best = meta.italicWeights[0];
            for (const iw of meta.italicWeights) {
              if (Math.abs(iw - w) < Math.abs(best - w)) best = iw;
            }
            return best;
          }),
        ),
      ].sort((a, b) => a - b);
      const tuples = [
        ...clamped.map((w) => `0,${w}`),
        ...italicClamped.map((w) => `1,${w}`),
      ];
      axis = `ital,wght@${tuples.join(";")}`;
    } else {
      axis = `wght@${clamped.join(";")}`;
    }
    params.push(`family=${encoded}:${axis}`);
  }

  if (params.length === 0) return null;
  return `https://fonts.googleapis.com/css2?${params.join("&")}&display=swap`;
}
