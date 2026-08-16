/**
 * Builder-node STYLE SCALES — the renderer's preset value maps, exported.
 *
 * These used to be module-private consts inside `render.tsx`, which forced the
 * inspector field kit (`inspectors/field-kit/preset-values.ts`) to MIRROR the
 * numbers and guard the mirror with a test that read `render.tsx` as text
 * (Inspector Reset P1 was forbidden from editing existing files). P2 lifts the
 * scales into this tiny pure module so both the renderer and the inspector
 * import ONE source and drift is structurally impossible — the text-parsing
 * guard is deleted, not because the honesty rule relaxed, but because the
 * import graph now enforces it.
 *
 * Pure data. No React, no side effects — safe to import from unit-test lanes.
 */

/** Flex/grid gap presets (`style.gap`). NOT the same scale as NODE_SPACING. */
export const GAP_BY_SIZE = {
  s: "0.75rem",
  m: "1.25rem",
  l: "2rem",
} as const;

/** Spacer-node height presets. */
export const SPACER_BY_SIZE = {
  s: "1rem",
  m: "2rem",
  l: "3rem",
} as const;

/** Icon-node size presets. */
export const ICON_SIZE = {
  sm: "1.25rem",
  md: "2rem",
  lg: "3rem",
  xl: "4.5rem",
} as const;

/** Margin/padding presets (`style.marginTop` etc). */
export const NODE_SPACING = {
  none: "0",
  s: "0.75rem",
  m: "1.5rem",
  l: "3rem",
  xl: "6rem",
} as const;

/** Max-width presets (`style.maxWidth`). */
export const NODE_MAX_WIDTH = {
  narrow: "420px",
  reading: "680px",
  wide: "960px",
  full: "100%",
} as const;

/** Corner-radius presets (`style.radius`). `pill` is a fully-rounded sentinel. */
export const NODE_RADIUS = {
  none: "0",
  sm: "4px",
  md: "8px",
  lg: "16px",
  pill: "999px",
} as const;

/**
 * Fluid text-size tiers — the `font-size` each
 * `[data-builder-style-size="…"]` rule emits. Interpolated into
 * `BUILDER_NODE_RENDERER_CSS`; the inspector derives its honest
 * "range" captions from the same clamps.
 */
export const TEXT_SIZE_CLAMP = {
  sm: "clamp(0.9rem,1vw,1rem)",
  md: "clamp(1rem,1.3vw,1.25rem)",
  lg: "clamp(1.35rem,2vw,2.25rem)",
  xl: "clamp(2rem,4vw,4.5rem)",
  display: "clamp(3.5rem,6vw,6rem)",
} as const;

/** Paragraph nodes resolve lg/xl/display to a smaller clamp than headings. */
export const TEXT_SIZE_CLAMP_PARAGRAPH = {
  lg: "clamp(1.1rem,1.45vw,1.45rem)",
  xl: "clamp(1.25rem,1.8vw,1.8rem)",
  display: "clamp(2rem,4vw,4.5rem)",
} as const;
