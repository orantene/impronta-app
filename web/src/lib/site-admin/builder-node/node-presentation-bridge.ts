import type { NodePresentationValue } from "../sections/shared/node-presentation";
import type { BuilderNodeStyle, BuilderNodeStyleValue } from "./types";

/**
 * STYLE-ENGINE BRIDGE — Engine-B (curated `nodePresentation`) ↔ Engine-A
 * (`BuilderNodeStyle`).
 *
 * The builder runs two parallel style models:
 *  - **Engine A** — `BuilderNodeStyle` (freeform nodes). Lengths are stored as
 *    raw CSS strings (`"740px"`, `"1.2"`), colors as CSS color strings, and a
 *    few enum tokens (`align`/`size`/`tone`).
 *  - **Engine B** — `NodePresentationValue` (a curated section role's "Type &
 *    color overrides"). The SAME concepts but lengths are stored as px INTEGERS
 *    (`maxWidthPx: 740`, `marginTopPx: 14`) and a couple of fields use a
 *    different unit convention (`lineHeightPct: 120` vs Engine-A `lineHeight:
 *    "1.2"`).
 *
 * This module is the single, tested conversion seam between the two. It powers:
 *  - **W4-T2** (collapse the dual inspector — route the curated role branch of
 *    style-panel through `BuilderNodeStyle` and write back via
 *    `builderStyleToNodePresentation`), and
 *  - **W4-T3** (lossless section eject — translate each role's stored
 *    `nodePresentation` onto the ejected child's `BuilderNodeStyle`).
 *
 * Design rules:
 *  - **px-int ↔ CSS-string.** Engine-B's `*Px` integers map to Engine-A's CSS
 *    length strings (`14` ⇄ `"14px"`). Going B→A we emit `"<n>px"`; going A→B
 *    we parse a leading integer and DROP a value we cannot represent as a clean
 *    px integer (e.g. `"3rem"`, `"clamp(…)"`) — Engine-B's Zod schema only
 *    accepts integers, so a non-px value has no lossless Engine-B home. The
 *    round-trip is lossless for every value Engine-B can store.
 *  - **Key-name map.** Where the two engines disagree on a field name, the map
 *    is explicit and bidirectional (e.g. `maxWidthPx` ⇄ `maxWidthFree`,
 *    `marginTopPx` ⇄ `marginTopFree`, `fontSizePx` ⇄ `fontSize`).
 *  - **Inline shorthands.** Engine-B has `marginInlinePx`/`paddingInlinePx`
 *    (a single value for both horizontal sides). Engine-A has no inline-margin
 *    free escape, so B→A expands inline → left+right. A→B re-collapses to inline
 *    ONLY when left === right (the lossless case); asymmetric sides stay as the
 *    per-side `*Px` fields.
 *  - **Shared-vocab passthrough.** Fields that exist on BOTH with the same name
 *    AND the same value vocabulary (`align`, `size`, `tone`, `fontFamily`,
 *    `fontWeight`, `textTransform`, `textWrap`, `whiteSpace`, `lineClamp`,
 *    `textColor`, `backgroundColor`, `borderColor`, `borderStyle`,
 *    `visibility`) pass straight through.
 *
 * Pure + dependency-free (types only) so it is safe to import from server
 * (publish/eject) and client (inspector) alike.
 */

const PX_RE = /^(-?\d+)px$/;

/** Parse a clean integer-px CSS string ("14px" → 14). Returns null otherwise. */
function parsePxInt(value: string | undefined): number | null {
  if (typeof value !== "string") return null;
  const m = value.trim().match(PX_RE);
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

/** Parse a leading integer from a bare-number string ("120" → 120). */
function parseIntStrict(value: string | undefined): number | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) return null;
  const n = Number.parseInt(trimmed, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Engine B → Engine A. Translate a curated role's `nodePresentation` value onto
 * a `BuilderNodeStyle` (the freeform style model). Lossless for everything
 * Engine-B can store. Returns only the keys that were set (no empty fields), so
 * the result can be spread over an existing style without clobbering.
 */
export function nodePresentationToBuilderStyle(
  np: NodePresentationValue | null | undefined,
): BuilderNodeStyle {
  const out: Record<string, unknown> = {};
  if (!np) return out as BuilderNodeStyle;

  // ── Shared-vocab enum/string passthrough ──────────────────────────────────
  if (np.align !== undefined) out.align = np.align;
  if (np.size !== undefined) out.size = np.size;
  if (np.tone !== undefined) out.tone = np.tone;
  if (np.fontFamily !== undefined) out.fontFamily = np.fontFamily;
  if (np.fontWeight !== undefined) out.fontWeight = np.fontWeight;
  if (np.textTransform !== undefined) out.textTransform = np.textTransform;
  if (np.textWrap !== undefined) out.textWrap = np.textWrap;
  if (np.whiteSpace !== undefined) out.whiteSpace = np.whiteSpace;
  if (np.lineClamp !== undefined) out.lineClamp = np.lineClamp;
  if (np.textColor !== undefined) out.textColor = np.textColor;
  if (np.backgroundColor !== undefined) out.backgroundColor = np.backgroundColor;
  if (np.borderColor !== undefined) out.borderColor = np.borderColor;
  if (np.borderStyle !== undefined) out.borderStyle = np.borderStyle;
  if (np.visibility !== undefined) out.visibility = np.visibility;

  // ── px-int → CSS-string (with key-name map) ───────────────────────────────
  if (np.maxWidthPx !== undefined) out.maxWidthFree = `${np.maxWidthPx}px`;
  if (np.marginTopPx !== undefined) out.marginTopFree = `${np.marginTopPx}px`;
  if (np.marginBottomPx !== undefined) {
    out.marginBottomFree = `${np.marginBottomPx}px`;
  }
  if (np.marginLeftPx !== undefined) out.marginLeftFree = `${np.marginLeftPx}px`;
  if (np.marginRightPx !== undefined) {
    out.marginRightFree = `${np.marginRightPx}px`;
  }
  if (np.paddingTopPx !== undefined) out.paddingTop = `${np.paddingTopPx}px`;
  if (np.paddingBottomPx !== undefined) {
    out.paddingBottom = `${np.paddingBottomPx}px`;
  }
  if (np.paddingLeftPx !== undefined) out.paddingLeft = `${np.paddingLeftPx}px`;
  if (np.paddingRightPx !== undefined) {
    out.paddingRight = `${np.paddingRightPx}px`;
  }
  // Inline shorthands → both horizontal sides (Engine-A has no inline-margin
  // free escape). Per-side values above win if BOTH are present (CSS author
  // intent: an explicit side overrides the inline shorthand).
  if (np.marginInlinePx !== undefined) {
    if (out.marginLeftFree === undefined) {
      out.marginLeftFree = `${np.marginInlinePx}px`;
    }
    if (out.marginRightFree === undefined) {
      out.marginRightFree = `${np.marginInlinePx}px`;
    }
  }
  if (np.paddingInlinePx !== undefined) {
    if (out.paddingLeft === undefined) out.paddingLeft = `${np.paddingInlinePx}px`;
    if (out.paddingRight === undefined) {
      out.paddingRight = `${np.paddingInlinePx}px`;
    }
  }

  // ── Unit-convention conversions ───────────────────────────────────────────
  if (np.fontSizePx !== undefined) out.fontSize = `${np.fontSizePx}px`;
  if (np.letterSpacingPx !== undefined) {
    out.letterSpacing = `${np.letterSpacingPx}px`;
  }
  if (np.lineHeightPct !== undefined) {
    // Engine-B stores a percentage int (120 = 1.2×); Engine-A stores the unitless
    // ratio string. Mirrors nodePresentationInlineStyle (lineHeightPct / 100).
    out.lineHeight = String(np.lineHeightPct / 100);
  }
  if (np.borderWidthPx !== undefined) out.borderWidth = `${np.borderWidthPx}px`;

  return out as BuilderNodeStyle;
}

/**
 * Engine A → Engine B. Translate a `BuilderNodeStyle` back into a curated role's
 * `nodePresentation` value. The INVERSE of `nodePresentationToBuilderStyle` for
 * every value Engine-B can store; any Engine-A value with no clean px-integer /
 * Engine-B home (`"3rem"`, `"clamp(…)"`, a non-Engine-B field like `boxShadow`)
 * is dropped — there is nowhere in the Engine-B schema to keep it.
 */
export function builderStyleToNodePresentation(
  style: BuilderNodeStyleValue | null | undefined,
): NodePresentationValue {
  const out: Record<string, unknown> = {};
  if (!style) return out as NodePresentationValue;

  // ── Shared-vocab enum/string passthrough ──────────────────────────────────
  if (style.align !== undefined) out.align = style.align;
  if (style.size !== undefined) out.size = style.size;
  if (style.tone !== undefined) out.tone = style.tone;
  if (style.fontFamily !== undefined) out.fontFamily = style.fontFamily;
  if (style.fontWeight !== undefined) out.fontWeight = style.fontWeight;
  if (style.textTransform !== undefined) out.textTransform = style.textTransform;
  if (style.textWrap !== undefined) out.textWrap = style.textWrap;
  if (style.whiteSpace !== undefined) out.whiteSpace = style.whiteSpace;
  if (style.lineClamp !== undefined) out.lineClamp = style.lineClamp;
  if (style.textColor !== undefined) out.textColor = style.textColor;
  if (style.backgroundColor !== undefined) {
    out.backgroundColor = style.backgroundColor;
  }
  if (style.borderColor !== undefined) out.borderColor = style.borderColor;
  if (style.borderStyle !== undefined) out.borderStyle = style.borderStyle;
  if (style.visibility !== undefined) out.visibility = style.visibility;

  // ── CSS-string → px-int (with key-name map) ───────────────────────────────
  const maxWidth = parsePxInt(style.maxWidthFree);
  if (maxWidth !== null) out.maxWidthPx = maxWidth;
  const marginTop = parsePxInt(style.marginTopFree);
  if (marginTop !== null) out.marginTopPx = marginTop;
  const marginBottom = parsePxInt(style.marginBottomFree);
  if (marginBottom !== null) out.marginBottomPx = marginBottom;
  const marginLeft = parsePxInt(style.marginLeftFree);
  const marginRight = parsePxInt(style.marginRightFree);
  const paddingTop = parsePxInt(style.paddingTop);
  if (paddingTop !== null) out.paddingTopPx = paddingTop;
  const paddingBottom = parsePxInt(style.paddingBottom);
  if (paddingBottom !== null) out.paddingBottomPx = paddingBottom;
  const paddingLeft = parsePxInt(style.paddingLeft);
  const paddingRight = parsePxInt(style.paddingRight);

  // Re-collapse symmetric horizontal sides into the inline shorthand (the
  // lossless inverse of the B→A inline expansion); keep asymmetric sides
  // per-side so nothing is lost.
  if (marginLeft !== null && marginRight !== null && marginLeft === marginRight) {
    out.marginInlinePx = marginLeft;
  } else {
    if (marginLeft !== null) out.marginLeftPx = marginLeft;
    if (marginRight !== null) out.marginRightPx = marginRight;
  }
  if (
    paddingLeft !== null &&
    paddingRight !== null &&
    paddingLeft === paddingRight
  ) {
    out.paddingInlinePx = paddingLeft;
  } else {
    if (paddingLeft !== null) out.paddingLeftPx = paddingLeft;
    if (paddingRight !== null) out.paddingRightPx = paddingRight;
  }

  // ── Unit-convention conversions ───────────────────────────────────────────
  const fontSize = parsePxInt(style.fontSize);
  if (fontSize !== null) out.fontSizePx = fontSize;
  const letterSpacing = parsePxInt(style.letterSpacing);
  if (letterSpacing !== null) out.letterSpacingPx = letterSpacing;
  if (style.lineHeight !== undefined) {
    const ratio = Number.parseFloat(style.lineHeight);
    // Only a unitless ratio ("1.2") round-trips to a percentage int; a length
    // line-height ("18px") or keyword ("normal") has no Engine-B home.
    if (
      Number.isFinite(ratio) &&
      !/[a-z%]/i.test(style.lineHeight.trim()) &&
      parseIntStrict(style.lineHeight) === null // not a bare int (would be ×100-ambiguous)
    ) {
      out.lineHeightPct = Math.round(ratio * 100);
    } else if (/^-?\d+$/.test(style.lineHeight.trim())) {
      // A bare integer ratio ("2") is still a valid unitless line-height.
      out.lineHeightPct = Math.round(Number.parseInt(style.lineHeight.trim(), 10) * 100);
    }
  }
  const borderWidth = parsePxInt(style.borderWidth);
  if (borderWidth !== null) out.borderWidthPx = borderWidth;

  return out as NodePresentationValue;
}
