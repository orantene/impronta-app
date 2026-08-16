/**
 * Inspector FIELD KIT — the HONEST VALUE MAPPING (D9 item 1).
 *
 * OWNER'S AMENDMENT, verbatim: a padding chip is not "M", it is "M" with "16"
 * under it. No more choices that "don't say anything about the # size of it".
 *
 * So this module answers, for every preset the inspector offers: what does it
 * ACTUALLY resolve to? The answers are not invented here — they are read out of
 * the renderer, which is the only place that decides:
 *
 *   `src/lib/site-admin/builder-node/render.tsx`
 *     NODE_SPACING   → margin / padding presets ("", none, s, m, l, xl)
 *     NODE_RADIUS    → corner presets (none, sm, md, lg, pill)
 *     NODE_MAX_WIDTH → width presets (narrow, reading, wide, full)
 *     GAP_BY_SIZE    → flex/grid gap presets (s, m, l)
 *     SPACER_BY_SIZE → spacer-node height presets (s, m, l)
 *     ICON_SIZE      → icon-node size presets (sm, md, lg, xl)
 *     the `[data-builder-style-size="…"]` font-size rules → text size tiers
 *
 *   `inspectors/style-panel/style-options.ts`
 *     BUILDER_NODE_SHADOW_OPTIONS → shadow presets (the CSS *is* the value)
 *     BUILDER_NODE_BORDER_STYLE_OPTIONS → border-style presets
 *
 * Those renderer maps are module-private `const`s and P1 is forbidden from
 * editing existing files, so the values are MIRRORED here — and
 * `preset-values.parity.test.ts` reads `render.tsx` as text and fails if the
 * mirror drifts. That is the whole point: a chip that displays a stale number
 * is worse than a chip that displays nothing, because it lies confidently.
 *
 * WHAT "HONEST" MEANS FOR A VALUE THAT ISN'T A CONSTANT
 * Two families are not fixed numbers, and this module does NOT fake one:
 *
 *   1. FLUID TYPE. The size tiers are `clamp()` — `lg` is
 *      `clamp(1.35rem, 2vw, 2.25rem)`, and a PARAGRAPH node resolves `lg` to a
 *      different clamp than a heading does. These carry `kind: "fluid"` with a
 *      real min/max range and a `variantNote`, so the chip can read
 *      "L / 22-36 px" instead of pretending to be a single number.
 *   2. THEME-BOUND VALUES. Anything a tenant theme can restyle carries
 *      `themeToken` (the token name) alongside the resolved example, and
 *      `themeDependent: true`. Today the spacing/radius scales are NOT
 *      theme-bound — they are hard constants in the renderer — so nothing in
 *      this file claims to be. If a future pass moves them onto theme tokens,
 *      set the flag rather than deleting the number.
 *
 * Pure data + pure functions. No React, no side effects.
 */

import type { LengthUnit } from "../../kit/number-unit";

/** Root font size the renderer's `rem` values resolve against. */
export const ROOT_FONT_PX = 16;

/** `rem` → `px` at the document root size. */
export function remToPx(rem: number): number {
  return Math.round(rem * ROOT_FONT_PX * 100) / 100;
}

/**
 * One preset choice, with its real resolved value attached.
 *
 * `kind` tells a chip how to display the value:
 *   - "length"  → a number + unit. The chip shows the number; clicking it
 *                 fills the exact-value input with `{ value, unit }`.
 *   - "fluid"   → a `clamp()`. There is no single number, so the chip shows
 *                 the range and clicking it does NOT fill a number input
 *                 (`numeric` is null).
 *   - "keyword" → a CSS keyword or a raw value string (`solid`, a shadow).
 *                 The chip shows the label; the glyph carries the meaning.
 *   - "unset"   → the "" option: inherit the theme/parent default.
 */
export type PresetKind = "length" | "fluid" | "keyword" | "unset";

export interface PresetValue {
  /** The value written to the node style. `""` means unset/inherit. */
  readonly id: string;
  /** Short display label. Kept identical to the existing option tables. */
  readonly label: string;
  readonly kind: PresetKind;
  /** The exact CSS the renderer emits for this preset. */
  readonly css: string;
  /**
   * The number + unit an exact-value input should adopt when this chip is
   * clicked, or null when the preset has no single number (fluid/keyword/unset).
   */
  readonly numeric: { readonly value: number; readonly unit: LengthUnit } | null;
  /** Fluid presets only: the resolved px range, min→max. */
  readonly rangePx?: readonly [number, number];
  /** True when a tenant theme can change what this resolves to. */
  readonly themeDependent?: boolean;
  /** Theme token name, when `themeDependent`. */
  readonly themeToken?: string;
  /** Anything a chip caption cannot carry but a reviewer must know. */
  readonly variantNote?: string;
}

export type PresetTable = ReadonlyArray<PresetValue>;

const UNSET: PresetValue = {
  id: "",
  label: "Default",
  kind: "unset",
  css: "",
  numeric: null,
};

function px(id: string, label: string, value: number): PresetValue {
  return {
    id,
    label,
    kind: "length",
    css: value === 0 ? "0" : `${value}px`,
    numeric: { value, unit: "px" },
  };
}

function rem(id: string, label: string, value: number): PresetValue {
  return {
    id,
    label,
    kind: "length",
    css: value === 0 ? "0" : `${value}rem`,
    numeric: { value: remToPx(value), unit: "px" },
  };
}

// ── Spacing (render.tsx NODE_SPACING) ────────────────────────────────────────
//
// The renderer defines five steps. The Style panel's picker
// (BUILDER_NODE_SPACING_OPTIONS) exposes only none/s/m/l — `xl` is reachable
// from the renderer and from presets but has never had a chip. P2 should
// decide whether to surface it; the honest table carries it either way.

/** `s` = 0.75rem = 12px. */
export const SPACING_PRESETS: PresetTable = [
  UNSET,
  { ...rem("none", "0", 0), css: "0" },
  rem("s", "S", 0.75),
  rem("m", "M", 1.5),
  rem("l", "L", 3),
  rem("xl", "XL", 6),
];

/** The subset the Style panel actually renders today (no `xl` chip). */
export const SPACING_PRESETS_SHIPPED: PresetTable = SPACING_PRESETS.filter(
  (p) => p.id !== "xl",
);

// ── Corner radius (render.tsx NODE_RADIUS) ───────────────────────────────────

export const RADIUS_PRESETS: PresetTable = [
  UNSET,
  { ...px("none", "Sharp", 0), css: "0" },
  px("sm", "S", 4),
  px("md", "M", 8),
  px("lg", "L", 16),
  {
    id: "pill",
    label: "Pill",
    kind: "keyword",
    css: "999px",
    numeric: null,
    variantNote:
      "999px is a fully-rounded sentinel, not a real corner size. It is a keyword, not a number, so the exact input stays empty.",
  },
];

// ── Max width (render.tsx NODE_MAX_WIDTH) ────────────────────────────────────

export const MAX_WIDTH_PRESETS: PresetTable = [
  { id: "", label: "Auto", kind: "unset", css: "", numeric: null },
  px("narrow", "Narrow", 420),
  px("reading", "Read", 680),
  px("wide", "Wide", 960),
  {
    id: "full",
    label: "Full",
    kind: "keyword",
    css: "100%",
    numeric: { value: 100, unit: "%" },
  },
];

// ── Gap (render.tsx GAP_BY_SIZE) ─────────────────────────────────────────────
//
// NOT the same scale as NODE_SPACING: gap `m` is 1.25rem (20px) while spacing
// `m` is 1.5rem (24px). This is exactly the kind of divergence a chip labelled
// only "M" hides — two "M" chips in the same panel meaning different numbers.

export const GAP_PRESETS: PresetTable = [
  rem("s", "S", 0.75),
  rem("m", "M", 1.25),
  rem("l", "L", 2),
];

// ── Spacer node height (render.tsx SPACER_BY_SIZE) ───────────────────────────

export const SPACER_PRESETS: PresetTable = [
  rem("s", "S", 1),
  rem("m", "M", 2),
  rem("l", "L", 3),
];

// ── Icon size (render.tsx ICON_SIZE) ─────────────────────────────────────────

export const ICON_SIZE_PRESETS: PresetTable = [
  rem("sm", "S", 1.25),
  rem("md", "M", 2),
  rem("lg", "L", 3),
  rem("xl", "XL", 4.5),
];

// ── Text size tiers (render.tsx `[data-builder-style-size]` rules) ───────────
//
// FLUID. Each tier is a clamp(min, preferred, max); there is no one number.
// Heading-ish nodes take the base rule; `.site-builder-node--paragraph`
// overrides lg / xl / display with a smaller clamp. Both are recorded.

function fluid(
  id: string,
  label: string,
  minRem: number,
  vw: number,
  maxRem: number,
  variantNote?: string,
): PresetValue {
  return {
    id,
    label,
    kind: "fluid",
    css: `clamp(${minRem}rem, ${vw}vw, ${maxRem}rem)`,
    numeric: null,
    rangePx: [remToPx(minRem), remToPx(maxRem)],
    variantNote,
  };
}

const PARAGRAPH_NOTE =
  "Paragraph nodes resolve this tier to a smaller clamp than headings do.";

export const TEXT_SIZE_PRESETS: PresetTable = [
  UNSET,
  fluid("sm", "S", 0.9, 1, 1),
  fluid("md", "M", 1, 1.3, 1.25),
  fluid("lg", "L", 1.35, 2, 2.25, PARAGRAPH_NOTE),
  fluid("xl", "XL", 2, 4, 4.5, PARAGRAPH_NOTE),
  fluid("display", "Display", 3.5, 6, 6, PARAGRAPH_NOTE),
];

/** The paragraph-node overrides, for a panel that knows it has a paragraph. */
export const TEXT_SIZE_PRESETS_PARAGRAPH: PresetTable = [
  UNSET,
  fluid("sm", "S", 0.9, 1, 1),
  fluid("md", "M", 1, 1.3, 1.25),
  fluid("lg", "L", 1.1, 1.45, 1.45),
  fluid("xl", "XL", 1.25, 1.8, 1.8),
  fluid("display", "Display", 2, 4, 4.5),
];

// ── Border style (style-options.ts BUILDER_NODE_BORDER_STYLE_OPTIONS) ────────

export const BORDER_STYLE_PRESETS: PresetTable = [
  { id: "", label: "None", kind: "unset", css: "none", numeric: null },
  { id: "solid", label: "Solid", kind: "keyword", css: "solid", numeric: null },
  { id: "dashed", label: "Dash", kind: "keyword", css: "dashed", numeric: null },
  { id: "dotted", label: "Dot", kind: "keyword", css: "dotted", numeric: null },
];

// ── Shadow (style-options.ts BUILDER_NODE_SHADOW_OPTIONS) ────────────────────
//
// Here the preset id IS the CSS, so a glyph tile can render the literal shadow
// it is offering. That is D9 item 3 at its most literal.

export const SHADOW_PRESETS: PresetTable = [
  { id: "", label: "None", kind: "unset", css: "none", numeric: null },
  {
    id: "0 1px 2px rgba(18,18,18,0.06), 0 1px 3px rgba(18,18,18,0.10)",
    label: "S",
    kind: "keyword",
    css: "0 1px 2px rgba(18,18,18,0.06), 0 1px 3px rgba(18,18,18,0.10)",
    numeric: null,
  },
  {
    id: "0 4px 8px rgba(18,18,18,0.06), 0 6px 16px rgba(18,18,18,0.12)",
    label: "M",
    kind: "keyword",
    css: "0 4px 8px rgba(18,18,18,0.06), 0 6px 16px rgba(18,18,18,0.12)",
    numeric: null,
  },
  {
    id: "0 12px 24px rgba(18,18,18,0.10), 0 20px 48px rgba(18,18,18,0.16)",
    label: "L",
    kind: "keyword",
    css: "0 12px 24px rgba(18,18,18,0.10), 0 20px 48px rgba(18,18,18,0.16)",
    numeric: null,
  },
];

// ── Display helpers ──────────────────────────────────────────────────────────

/**
 * The caption a chip shows UNDER its label — the whole reason D9 exists.
 * Returns null when there is genuinely nothing honest to show (the unset
 * option, whose value is "whatever the theme says").
 */
export function presetCaption(preset: PresetValue): string | null {
  switch (preset.kind) {
    case "unset":
      return null;
    case "length":
      return preset.numeric ? formatPx(preset.numeric.value, preset.numeric.unit) : preset.css;
    case "fluid":
      return preset.rangePx
        ? `${trimNum(preset.rangePx[0])}-${trimNum(preset.rangePx[1])}`
        : null;
    case "keyword":
      // A shadow's CSS is far too long for a 10.5px caption; the glyph shows it.
      return preset.css.length <= 8 ? preset.css : null;
  }
}

function trimNum(n: number): string {
  return String(Math.round(n * 100) / 100);
}

function formatPx(value: number, unit: LengthUnit): string {
  return unit === "px" ? trimNum(value) : `${trimNum(value)}${unit}`;
}

/**
 * Find the preset whose resolved number equals `value` + `unit`.
 *
 * DECISION (documented, and tested): exact-match re-lighting IS wanted. If the
 * operator types 24 into a spacing field, the "M / 24" chip lights up again.
 *
 * The alternative — once custom, always custom until a chip is clicked — was
 * rejected because the chip's own caption would then read "24" while sitting
 * dark next to an input reading "24", which is the panel telling the operator
 * two different things about one value. Re-lighting keeps the row internally
 * consistent, and the operator loses nothing: typing a different number
 * un-lights it again.
 *
 * Unit must match too: 24px is the M preset, 24rem is not.
 */
export function matchPreset(
  presets: PresetTable,
  numeric: { value: number; unit: LengthUnit } | null,
): PresetValue | null {
  if (!numeric) return null;
  return (
    presets.find(
      (p) =>
        p.numeric !== null &&
        p.numeric.value === numeric.value &&
        p.numeric.unit === numeric.unit,
    ) ?? null
  );
}

/** Look a preset up by the id stored on the node style. */
export function presetById(presets: PresetTable, id: string): PresetValue | null {
  return presets.find((p) => p.id === id) ?? null;
}

/**
 * Every table this module publishes, for guards and for P2's audit. Keyed by
 * the renderer symbol it mirrors so a drift failure names its own source.
 */
export const PRESET_TABLES: Readonly<Record<string, PresetTable>> = {
  NODE_SPACING: SPACING_PRESETS,
  NODE_RADIUS: RADIUS_PRESETS,
  NODE_MAX_WIDTH: MAX_WIDTH_PRESETS,
  GAP_BY_SIZE: GAP_PRESETS,
  SPACER_BY_SIZE: SPACER_PRESETS,
  ICON_SIZE: ICON_SIZE_PRESETS,
  TEXT_SIZE: TEXT_SIZE_PRESETS,
  TEXT_SIZE_PARAGRAPH: TEXT_SIZE_PRESETS_PARAGRAPH,
  BORDER_STYLE: BORDER_STYLE_PRESETS,
  SHADOW: SHADOW_PRESETS,
};
