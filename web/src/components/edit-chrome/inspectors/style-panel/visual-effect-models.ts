/**
 * visual-effect-models — the pure value grammar behind the visual effect
 * controls (glass backdrop, per-corner radius, per-side border widths, the
 * multi-layer shadow stack).
 *
 * Every parse here is HONEST about its limits: a value the grammar cannot
 * represent returns `null` (or a `raw` layer) instead of a defaulted
 * approximation, so the control that consumes it stands down and shows the
 * hand-authored string verbatim rather than silently rewriting it on load.
 * That is the codebase's anti-silent-snap rule, and the tests beside this
 * file pin it.
 *
 * Composers mirror the save-side zod caps (`registry.ts`): `borderWidth` is
 * capped at 16 chars and `boxShadow` at 200, and a composed value that would
 * blow the cap must NOT be emitted — a save-side rejection would drop the
 * whole patch silently, which is the exact bug class this panel exists to
 * avoid. The controls check the exported caps and warn instead.
 */

import type { BuilderNodeStyleValue } from "@/lib/site-admin/builder-node/types";

// ── Shared: split on top-level commas only (commas inside rgba()/var() etc.
//    are inside parentheses and must not split). ──────────────────────────────

export function splitTopLevelCommas(raw: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of raw) {
    if (ch === "(") { depth++; current += ch; }
    else if (ch === ")") { depth--; current += ch; }
    else if (ch === "," && depth === 0) { parts.push(current.trim()); current = ""; }
    else { current += ch; }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

// ── Glass backdrop (backdrop-filter) ─────────────────────────────────────────

export interface GlassBackdropParts {
  /** blur radius in px */
  blur: number;
  /** saturate factor (1 = neutral); null = no saturate() term */
  saturate: number | null;
}

/**
 * Parse a backdrop-filter string the glass controls can own: exactly one
 * `blur(Npx)` plus an optional `saturate(X)` in either order, nothing else.
 * Any other function (invert, brightness, a second blur…) → null, so the
 * control shows the string verbatim instead of flattening it.
 */
export function parseGlassBackdrop(value: string | undefined): GlassBackdropParts | null {
  if (!value || !value.trim()) return null;
  const terms = value.trim().split(/\s+/);
  let blur: number | null = null;
  let saturate: number | null = null;
  for (const term of terms) {
    const blurMatch = /^blur\((\d+(?:\.\d+)?)px\)$/.exec(term);
    if (blurMatch && blur === null) { blur = Number(blurMatch[1]); continue; }
    const satMatch = /^saturate\((\d+(?:\.\d+)?)\)$/.exec(term);
    if (satMatch && saturate === null) { saturate = Number(satMatch[1]); continue; }
    return null;
  }
  if (blur === null) return null;
  return { blur, saturate };
}

export function composeGlassBackdrop(p: GlassBackdropParts): string {
  const blur = `blur(${p.blur}px)`;
  return p.saturate !== null ? `${blur} saturate(${p.saturate})` : blur;
}

/**
 * The one-click glass surface: frosted backdrop + translucent fill + hairline
 * border. Each part stays individually adjustable through its own control
 * afterwards — this is a starting point, not a mode.
 */
export const GLASS_SURFACE_PATCH: Partial<BuilderNodeStyleValue> = {
  backdropFilter: "blur(12px) saturate(1.4)",
  backgroundColor: "rgba(255,255,255,0.12)",
  borderColor: "rgba(255,255,255,0.25)",
  borderWidth: "1px",
  borderStyle: "solid",
};

// ── Per-corner border-radius ────────────────────────────────────────────────

export interface CornerRadiusParts {
  topLeft: string;
  topRight: string;
  bottomRight: string;
  bottomLeft: string;
}

const SIMPLE_LENGTH = /^(?:-?\d*\.?\d+(?:px|rem|em|%)|0)$/;

/**
 * Parse a border-radius shorthand of 1-4 simple lengths into four corners.
 * Elliptical radii ("16px / 8px"), calc(), var(), and token bindings are not
 * representable → null (control stands down, string stays verbatim).
 */
export function parseCornerRadius(value: string | undefined): CornerRadiusParts | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("/") || trimmed.includes("(") || trimmed.includes(":")) {
    return null;
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length < 1 || parts.length > 4) return null;
  if (!parts.every((p) => SIMPLE_LENGTH.test(p))) return null;
  const [a, b, c, d] = parts;
  // CSS shorthand expansion: 1 → all; 2 → tl/br=a tr/bl=b; 3 → tl=a tr/bl=b br=c; 4 → tl tr br bl.
  switch (parts.length) {
    case 1:
      return { topLeft: a!, topRight: a!, bottomRight: a!, bottomLeft: a! };
    case 2:
      return { topLeft: a!, topRight: b!, bottomRight: a!, bottomLeft: b! };
    case 3:
      return { topLeft: a!, topRight: b!, bottomRight: c!, bottomLeft: b! };
    default:
      return { topLeft: a!, topRight: b!, bottomRight: c!, bottomLeft: d! };
  }
}

/** Compose the minimal CSS shorthand for four corner values. */
export function composeCornerRadius(p: CornerRadiusParts): string {
  const { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl } = p;
  if (tl === tr && tr === br && br === bl) return tl;
  if (tl === br && tr === bl) return `${tl} ${tr}`;
  if (tr === bl) return `${tl} ${tr} ${br}`;
  return `${tl} ${tr} ${br} ${bl}`;
}

// ── Per-side border widths ──────────────────────────────────────────────────

/** Save-side zod cap on `borderWidth` (registry.ts). Never emit past it. */
export const BORDER_WIDTH_MAX_CHARS = 16;

export interface BorderSideWidths {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const PX_OR_ZERO = /^(?:(\d*\.?\d+)px|0)$/;

/**
 * Parse a border-width shorthand of 1-4 px values (bare `0` allowed) into
 * per-side px numbers. Anything else (em, calc, keywords) → null.
 */
export function parseBorderSideWidths(value: string | undefined): BorderSideWidths | null {
  if (!value) return null;
  const parts = value.trim().split(/\s+/);
  if (parts.length < 1 || parts.length > 4) return null;
  const nums: number[] = [];
  for (const part of parts) {
    const m = PX_OR_ZERO.exec(part);
    if (!m) return null;
    nums.push(m[1] !== undefined ? Number(m[1]) : 0);
  }
  const [a, b, c, d] = nums;
  switch (nums.length) {
    case 1:
      return { top: a!, right: a!, bottom: a!, left: a! };
    case 2:
      return { top: a!, right: b!, bottom: a!, left: b! };
    case 3:
      return { top: a!, right: b!, bottom: c!, left: b! };
    default:
      return { top: a!, right: b!, bottom: c!, left: d! };
  }
}

function widthTerm(n: number): string {
  return n === 0 ? "0" : `${n}px`;
}

/**
 * Compose the minimal border-width shorthand. Zero sides compose as bare `0`
 * (valid CSS, and it keeps realistic per-side values inside the 16-char save
 * cap). Returns null when even the minimal form would blow the cap — the
 * control must warn and NOT emit rather than let the save silently drop it.
 */
export function composeBorderSideWidths(p: BorderSideWidths): string | null {
  const { top: t, right: r, bottom: b, left: l } = p;
  let out: string;
  if (t === r && r === b && b === l) out = widthTerm(t);
  else if (t === b && r === l) out = `${widthTerm(t)} ${widthTerm(r)}`;
  else if (r === l) out = `${widthTerm(t)} ${widthTerm(r)} ${widthTerm(b)}`;
  else out = `${widthTerm(t)} ${widthTerm(r)} ${widthTerm(b)} ${widthTerm(l)}`;
  return out.length <= BORDER_WIDTH_MAX_CHARS ? out : null;
}

// ── Multi-layer shadow stack ────────────────────────────────────────────────

/** Save-side zod cap on `boxShadow` (registry.ts). Never emit past it. */
export const BOX_SHADOW_MAX_CHARS = 200;

export interface ShadowLayerParts {
  inset: boolean;
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
}

/**
 * One layer of the stack. `css` is the layer's exact source text and is what
 * composes back out; `parsed` is non-null only when the grammar fully owns the
 * layer. Editing a layer's controls replaces THAT layer's css; every other
 * layer round-trips byte-identical — including layers that never parsed.
 */
export interface ShadowLayer {
  css: string;
  parsed: ShadowLayerParts | null;
}

export const DEFAULT_SHADOW_LAYER: ShadowLayerParts = {
  inset: false,
  x: 0,
  y: 8,
  blur: 24,
  spread: 0,
  color: "rgba(0,0,0,0.18)",
};

// Lengths accept bare 0 (the shipped presets use it: "0 1px 2px rgba(…)").
const LEN = "(-?\\d+(?:\\.\\d+)?)(?:px)?";
const SHADOW_LAYER_RE = new RegExp(
  `^${LEN}\\s+${LEN}(?:\\s+${LEN})?(?:\\s+${LEN})?\\s*(.*)$`,
);

// The color tail must be a single recognizable color value spanning the whole
// remainder: hex, a bare keyword, or one functional color (rgba/hsl/oklch/
// color-mix/var). Anything else — a length function like min(), a second
// inset, trailing lengths — means syntax the grammar does not own, and the
// layer stays raw. Without this check `0 0 min(2px,1vw) red` would "parse"
// with the blur folded into the color and be silently corrupted on edit.
const COLOR_TAIL =
  /^(?:#[0-9a-fA-F]{3,8}|[a-zA-Z]+|(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|hwb|color|color-mix|var)\(.*\))$/;

/** Parse one shadow layer; null when the grammar cannot own it. */
export function parseShadowLayer(css: string): ShadowLayerParts | null {
  const trimmed = css.trim();
  if (!trimmed) return null;
  const inset = /^inset\b/.test(trimmed);
  const body = trimmed.replace(/^inset\s+/, "");
  const m = SHADOW_LAYER_RE.exec(body);
  if (!m) return null;
  const [, x, y, blur, spread, color] = m;
  const rest = (color ?? "").trim();
  if (rest && !COLOR_TAIL.test(rest)) return null;
  return {
    inset,
    x: Number(x),
    y: Number(y),
    blur: blur !== undefined ? Number(blur) : 0,
    spread: spread !== undefined ? Number(spread) : 0,
    color: rest || DEFAULT_SHADOW_LAYER.color,
  };
}

export function composeShadowLayer(p: ShadowLayerParts): string {
  return `${p.inset ? "inset " : ""}${p.x}px ${p.y}px ${p.blur}px ${p.spread}px ${p.color}`;
}

/**
 * Parse a (possibly comma-separated) box-shadow into layers. `"none"` and the
 * empty string yield an empty stack. Unparseable layers come back with
 * `parsed: null` and their exact source text.
 */
export function parseShadowStack(value: string | undefined): ShadowLayer[] {
  if (!value) return [];
  const trimmed = value.trim();
  if (!trimmed || trimmed === "none") return [];
  return splitTopLevelCommas(trimmed).map((css) => ({
    css,
    parsed: parseShadowLayer(css),
  }));
}

/**
 * Compose the stack back to CSS. Empty stack → undefined (unset the key).
 * Returns null when the composed value would blow the save cap — the control
 * warns and keeps the previous value instead of emitting a doomed patch.
 */
export function composeShadowStack(layers: ShadowLayer[]): string | undefined | null {
  if (layers.length === 0) return undefined;
  const out = layers.map((l) => l.css).join(", ");
  return out.length <= BOX_SHADOW_MAX_CHARS ? out : null;
}
