/**
 * border-shorthand — CSS 1-4 value TRBL grammar for border-style and
 * border-color.
 *
 * Per-side WIDTH already stores a shorthand on `borderWidth` ("1px 0 0").
 * Style and color were a single keyword / a single color, so a card could
 * not carry "dashed on top, solid elsewhere" without customCss. This module
 * is the shared parse/compose + the keyword union the TS type, zod, and
 * inspector all import. Existing one-keyword values (`solid`, `#111`) are
 * valid 1-value shorthands and round-trip unchanged.
 *
 * PURE: no React, no zod. Safe for the tsx test graph.
 */

/** CSS `border-style` keywords. The inspector offers the common five;
 *  the schema accepts the full CSS set so a typed `groove` is not stripped. */
export const BUILDER_BORDER_STYLE_KEYWORDS = [
  "none",
  "hidden",
  "dotted",
  "dashed",
  "solid",
  "double",
  "groove",
  "ridge",
  "inset",
  "outset",
] as const;
export type BuilderBorderStyleKeyword =
  (typeof BUILDER_BORDER_STYLE_KEYWORDS)[number];

const STYLE_SET: ReadonlySet<string> = new Set(BUILDER_BORDER_STYLE_KEYWORDS);

/** Zod / compose cap. "double dashed solid dotted" is 27 chars. */
export const BORDER_STYLE_MAX_CHARS = 64;

/**
 * Cap spend: four token-aware colors
 * (`var(--token-color-ink, #111111)` is ~36 chars) plus spaces. The old
 * 64-char cap fit one token-or-hex, not a per-side shorthand.
 */
export const BORDER_COLOR_MAX_CHARS = 256;

export interface BorderSideStyles {
  top: BuilderBorderStyleKeyword;
  right: BuilderBorderStyleKeyword;
  bottom: BuilderBorderStyleKeyword;
  left: BuilderBorderStyleKeyword;
}

export interface BorderSideColors {
  top: string;
  right: string;
  bottom: string;
  left: string;
}

export function isBuilderBorderStyleKeyword(
  value: string,
): value is BuilderBorderStyleKeyword {
  return STYLE_SET.has(value);
}

/**
 * Split on top-level whitespace only. Spaces inside `rgba()` / `var()` /
 * `color-mix()` must not split a single color.
 */
export function splitCssSpaceList(raw: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of raw.trim()) {
    if (ch === "(") {
      depth++;
      current += ch;
    } else if (ch === ")") {
      depth--;
      current += ch;
    } else if (/\s/.test(ch) && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function expandTrbl<T>(parts: T[]): [T, T, T, T] | null {
  const [a, b, c, d] = parts;
  if (a === undefined) return null;
  switch (parts.length) {
    case 1:
      return [a, a, a, a];
    case 2:
      if (b === undefined) return null;
      return [a, b, a, b];
    case 3:
      if (b === undefined || c === undefined) return null;
      return [a, b, c, b];
    case 4:
      if (b === undefined || c === undefined || d === undefined) return null;
      return [a, b, c, d];
    default:
      return null;
  }
}

function composeTrbl(values: readonly [string, string, string, string]): string {
  const [t, r, b, l] = values;
  if (t === r && r === b && b === l) return t;
  if (t === b && r === l) return `${t} ${r}`;
  if (r === l) return `${t} ${r} ${b}`;
  return `${t} ${r} ${b} ${l}`;
}

export function isBuilderBorderStyleShorthand(value: string): boolean {
  const parts = splitCssSpaceList(value);
  if (parts.length < 1 || parts.length > 4) return false;
  return parts.every(isBuilderBorderStyleKeyword);
}

export function parseBorderSideStyles(
  value: string | undefined,
): BorderSideStyles | null {
  if (!value || !value.trim()) return null;
  const parts = splitCssSpaceList(value);
  if (!parts.every(isBuilderBorderStyleKeyword)) return null;
  const expanded = expandTrbl(parts);
  if (!expanded) return null;
  const [top, right, bottom, left] = expanded;
  return { top, right, bottom, left };
}

export function composeBorderSideStyles(p: BorderSideStyles): string | null {
  const out = composeTrbl([p.top, p.right, p.bottom, p.left]);
  return out.length <= BORDER_STYLE_MAX_CHARS ? out : null;
}

/**
 * A color term is anything non-empty the CSS border-color shorthand would
 * accept as one side. We do not try to own every color function; a term with
 * unmatched parens is rejected so we never split `rgba(0,0,0,0.2` in half.
 */
export function isBuilderColorTerm(value: string): boolean {
  const t = value.trim();
  if (!t) return false;
  let depth = 0;
  for (const ch of t) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (depth < 0) return false;
  }
  return depth === 0;
}

export function isBuilderColorShorthand(value: string): boolean {
  const parts = splitCssSpaceList(value);
  if (parts.length < 1 || parts.length > 4) return false;
  return parts.every(isBuilderColorTerm);
}

export function parseBorderSideColors(
  value: string | undefined,
): BorderSideColors | null {
  if (!value || !value.trim()) return null;
  const parts = splitCssSpaceList(value);
  if (!parts.every(isBuilderColorTerm)) return null;
  const expanded = expandTrbl(parts);
  if (!expanded) return null;
  const [top, right, bottom, left] = expanded;
  return { top, right, bottom, left };
}

export function composeBorderSideColors(p: BorderSideColors): string | null {
  const out = composeTrbl([p.top, p.right, p.bottom, p.left]);
  return out.length <= BORDER_COLOR_MAX_CHARS ? out : null;
}
