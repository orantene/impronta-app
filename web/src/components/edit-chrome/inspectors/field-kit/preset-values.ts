/**
 * Inspector FIELD KIT — the HONEST VALUE MAPPING (D9 item 1).
 *
 * OWNER'S AMENDMENT, verbatim: a padding chip is not "M", it is "M" with "16"
 * under it. No more choices that "don't say anything about the # size of it".
 *
 * So this module answers, for every preset the inspector offers: what does it
 * ACTUALLY resolve to? The answers are not invented here — every number is
 * DERIVED, at module load, from the renderer's own scale maps in
 * `@/lib/site-admin/builder-node/style-scales`:
 *
 *     NODE_SPACING   → margin / padding presets ("", none, s, m, l, xl)
 *     NODE_RADIUS    → corner presets (none, sm, md, lg, pill)
 *     NODE_MAX_WIDTH → width presets (narrow, reading, wide, full)
 *     GAP_BY_SIZE    → flex/grid gap presets (s, m, l)
 *     SPACER_BY_SIZE → spacer-node height presets (s, m, l)
 *     ICON_SIZE      → icon-node size presets (sm, md, lg, xl)
 *     TEXT_SIZE_CLAMP / TEXT_SIZE_CLAMP_PARAGRAPH → fluid text tiers
 *
 * (P1 shipped these as a hand-mirrored copy guarded by a test that read
 * `render.tsx` as text, because P1 was forbidden from editing existing files.
 * P2 exported the scales from the renderer, so the mirror and its drift guard
 * are gone: a chip now CANNOT display a number the renderer does not emit.)
 *
 * Two option families still live in `inspectors/style-panel/style-options.ts`
 * (shadow + border-style presets); for those the CSS *is* the stored value, so
 * there is nothing to mirror and nothing to drift.
 *
 * WHAT "HONEST" MEANS FOR A VALUE THAT ISN'T A CONSTANT
 * Two families are not fixed numbers, and this module does NOT fake one:
 *
 *   1. FLUID TYPE. The size tiers are `clamp()` — `lg` is
 *      `clamp(1.35rem,2vw,2.25rem)`, and a PARAGRAPH node resolves `lg` to a
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

import {
  GAP_BY_SIZE,
  ICON_SIZE,
  NODE_MAX_WIDTH,
  NODE_RADIUS,
  NODE_SPACING,
  SPACER_BY_SIZE,
  TEXT_SIZE_CLAMP,
  TEXT_SIZE_CLAMP_PARAGRAPH,
} from "@/lib/site-admin/builder-node/style-scales";

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

/**
 * Turn a renderer scale entry ("0", "0.75rem", "420px") into a length preset
 * whose numeric is resolved to px. Throws at module load on a value it cannot
 * parse — a chip that cannot state its number honestly must not ship at all.
 */
function fromScale(id: string, label: string, css: string): PresetValue {
  const rem = css.match(/^([\d.]+)rem$/);
  if (rem) {
    return {
      id,
      label,
      kind: "length",
      css,
      numeric: { value: remToPx(Number(rem[1])), unit: "px" },
    };
  }
  const px = css.match(/^([\d.]+)px$/);
  if (px) {
    return { id, label, kind: "length", css, numeric: { value: Number(px[1]), unit: "px" } };
  }
  if (css === "0") {
    return { id, label, kind: "length", css, numeric: { value: 0, unit: "px" } };
  }
  throw new Error(
    `preset-values: renderer scale entry "${id}: ${css}" is not a length this ` +
      `module knows how to caption honestly. Teach fromScale() the new form.`,
  );
}

// ── Spacing (style-scales NODE_SPACING) ──────────────────────────────────────
//
// The renderer defines five steps. The Style panel's picker
// (BUILDER_NODE_SPACING_OPTIONS) exposes only none/s/m/l — `xl` is reachable
// from the renderer and from presets but has never had a chip. P2 should
// decide whether to surface it; the honest table carries it either way.

const SPACING_LABELS: Record<keyof typeof NODE_SPACING, string> = {
  none: "0",
  s: "S",
  m: "M",
  l: "L",
  xl: "XL",
};

/** `s` = 0.75rem = 12px. */
export const SPACING_PRESETS: PresetTable = [
  UNSET,
  ...(Object.keys(NODE_SPACING) as Array<keyof typeof NODE_SPACING>).map((id) =>
    fromScale(id, SPACING_LABELS[id], NODE_SPACING[id]),
  ),
];

/** The subset the Style panel actually renders today (no `xl` chip). */
export const SPACING_PRESETS_SHIPPED: PresetTable = SPACING_PRESETS.filter(
  (p) => p.id !== "xl",
);

// ── Corner radius (style-scales NODE_RADIUS) ─────────────────────────────────

const RADIUS_LABELS: Record<keyof typeof NODE_RADIUS, string> = {
  none: "Sharp",
  sm: "S",
  md: "M",
  lg: "L",
  pill: "Pill",
};

export const RADIUS_PRESETS: PresetTable = [
  UNSET,
  ...(Object.keys(NODE_RADIUS) as Array<keyof typeof NODE_RADIUS>).map((id) =>
    id === "pill"
      ? {
          id,
          label: RADIUS_LABELS.pill,
          kind: "keyword" as const,
          css: NODE_RADIUS.pill,
          numeric: null,
          variantNote:
            "999px is a fully-rounded sentinel, not a real corner size. It is a keyword, not a number, so the exact input stays empty.",
        }
      : fromScale(id, RADIUS_LABELS[id], NODE_RADIUS[id]),
  ),
];

// ── Max width (style-scales NODE_MAX_WIDTH) ──────────────────────────────────

const MAX_WIDTH_LABELS: Record<keyof typeof NODE_MAX_WIDTH, string> = {
  narrow: "Narrow",
  reading: "Read",
  wide: "Wide",
  full: "Full",
};

export const MAX_WIDTH_PRESETS: PresetTable = [
  { id: "", label: "Auto", kind: "unset", css: "", numeric: null },
  ...(Object.keys(NODE_MAX_WIDTH) as Array<keyof typeof NODE_MAX_WIDTH>).map((id) =>
    id === "full"
      ? {
          id,
          label: MAX_WIDTH_LABELS.full,
          kind: "keyword" as const,
          css: NODE_MAX_WIDTH.full,
          numeric: { value: 100, unit: "%" as const },
        }
      : fromScale(id, MAX_WIDTH_LABELS[id], NODE_MAX_WIDTH[id]),
  ),
];

// ── Gap (style-scales GAP_BY_SIZE) ───────────────────────────────────────────
//
// NOT the same scale as NODE_SPACING: gap `m` is 1.25rem (20px) while spacing
// `m` is 1.5rem (24px). This is exactly the kind of divergence a chip labelled
// only "M" hides — two "M" chips in the same panel meaning different numbers.

export const GAP_PRESETS: PresetTable = (
  Object.keys(GAP_BY_SIZE) as Array<keyof typeof GAP_BY_SIZE>
).map((id) => fromScale(id, id.toUpperCase(), GAP_BY_SIZE[id]));

// ── Spacer node height (style-scales SPACER_BY_SIZE) ─────────────────────────

export const SPACER_PRESETS: PresetTable = (
  Object.keys(SPACER_BY_SIZE) as Array<keyof typeof SPACER_BY_SIZE>
).map((id) => fromScale(id, id.toUpperCase(), SPACER_BY_SIZE[id]));

// ── Icon size (style-scales ICON_SIZE) ───────────────────────────────────────

const ICON_SIZE_LABELS: Record<keyof typeof ICON_SIZE, string> = {
  sm: "S",
  md: "M",
  lg: "L",
  xl: "XL",
};

export const ICON_SIZE_PRESETS: PresetTable = (
  Object.keys(ICON_SIZE) as Array<keyof typeof ICON_SIZE>
).map((id) => fromScale(id, ICON_SIZE_LABELS[id], ICON_SIZE[id]));

// ── Text size tiers (style-scales TEXT_SIZE_CLAMP*) ──────────────────────────
//
// FLUID. Each tier is a clamp(min, preferred, max); there is no one number.
// Heading-ish nodes take the base clamp; paragraph nodes override lg / xl /
// display with a smaller clamp. Both are recorded.

/** Parse the renderer's `clamp(<min>rem,<vw>vw,<max>rem)` into a px range. */
function fluidFromClamp(
  id: string,
  label: string,
  css: string,
  variantNote?: string,
): PresetValue {
  const m = css.match(/^clamp\(([\d.]+)rem,[\d.]+vw,([\d.]+)rem\)$/);
  if (!m) {
    throw new Error(
      `preset-values: text-size tier "${id}" is "${css}", which is not the ` +
        `clamp(<rem>,<vw>,<rem>) shape this module derives ranges from.`,
    );
  }
  return {
    id,
    label,
    kind: "fluid",
    css,
    numeric: null,
    rangePx: [remToPx(Number(m[1])), remToPx(Number(m[2]))],
    variantNote,
  };
}

const TEXT_SIZE_LABELS: Record<keyof typeof TEXT_SIZE_CLAMP, string> = {
  sm: "S",
  md: "M",
  lg: "L",
  xl: "XL",
  display: "Display",
};

const PARAGRAPH_NOTE =
  "Paragraph nodes resolve this tier to a smaller clamp than headings do.";

export const TEXT_SIZE_PRESETS: PresetTable = [
  UNSET,
  ...(Object.keys(TEXT_SIZE_CLAMP) as Array<keyof typeof TEXT_SIZE_CLAMP>).map(
    (id) =>
      fluidFromClamp(
        id,
        TEXT_SIZE_LABELS[id],
        TEXT_SIZE_CLAMP[id],
        id in TEXT_SIZE_CLAMP_PARAGRAPH ? PARAGRAPH_NOTE : undefined,
      ),
  ),
];

/** The paragraph-node overrides, for a panel that knows it has a paragraph. */
export const TEXT_SIZE_PRESETS_PARAGRAPH: PresetTable = [
  UNSET,
  ...(Object.keys(TEXT_SIZE_CLAMP) as Array<keyof typeof TEXT_SIZE_CLAMP>).map(
    (id) =>
      fluidFromClamp(
        id,
        TEXT_SIZE_LABELS[id],
        id in TEXT_SIZE_CLAMP_PARAGRAPH
          ? TEXT_SIZE_CLAMP_PARAGRAPH[id as keyof typeof TEXT_SIZE_CLAMP_PARAGRAPH]
          : TEXT_SIZE_CLAMP[id],
      ),
  ),
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
 * the renderer scale it derives from, so a failure names its own source.
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
