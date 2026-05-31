import { z } from "zod";
import type { CSSProperties } from "react";

export const nodePresentationValueSchema = z.object({
  align: z.enum(["left", "center", "right"]).optional(),
  maxWidthPx: z.number().int().min(120).max(1200).optional(),
  marginTopPx: z.number().int().min(0).max(240).optional(),
  marginBottomPx: z.number().int().min(0).max(240).optional(),
  marginInlinePx: z.number().int().min(0).max(200).optional(),
  marginLeftPx: z.number().int().min(0).max(200).optional(),
  marginRightPx: z.number().int().min(0).max(200).optional(),
  paddingTopPx: z.number().int().min(0).max(160).optional(),
  paddingBottomPx: z.number().int().min(0).max(160).optional(),
  paddingInlinePx: z.number().int().min(0).max(120).optional(),
  paddingLeftPx: z.number().int().min(0).max(120).optional(),
  paddingRightPx: z.number().int().min(0).max(120).optional(),
  size: z.enum(["sm", "md", "lg", "xl"]).optional(),
  tone: z.enum(["default", "muted", "strong"]).optional(),
  visibility: z.enum(["visible", "hidden"]).optional(),
  // Free typography + color escapes — override the theme tokens (size/tone)
  // above with raw values so a curated section sub-element can match any
  // design. Numeric fields stay in the px/int convention of this schema;
  // colors are stored as CSS color strings (validated by the CSSOM at render).
  fontFamily: z.string().max(160).optional(),
  fontSizePx: z.number().int().min(8).max(240).optional(),
  fontWeight: z.number().int().min(100).max(900).optional(),
  letterSpacingPx: z.number().min(-5).max(30).optional(),
  lineHeightPct: z.number().int().min(80).max(300).optional(),
  textTransform: z.enum(["none", "uppercase", "lowercase", "capitalize"]).optional(),
  // Advanced text controls — modern wrapping, whitespace, and line-clamp.
  textWrap: z.enum(["wrap", "nowrap", "balance", "pretty"]).optional(),
  whiteSpace: z.enum(["normal", "nowrap", "pre", "pre-wrap", "pre-line"]).optional(),
  lineClamp: z.number().int().min(1).max(20).optional(),
  // Colors hold either a literal CSS color OR a theme-token binding such as
  // `var(--token-color-surface-raised, #ffffff)` (~42 chars). Capped at 64 so a
  // token binding survives the parse — a too-long KNOWN key makes Zod THROW
  // (it does not silently strip), which would fail the save. Mirrors the
  // builder-node registry color fields (registry.ts).
  textColor: z.string().max(64).optional(),
  backgroundColor: z.string().max(64).optional(),
  borderColor: z.string().max(64).optional(),
  borderWidthPx: z.number().int().min(0).max(24).optional(),
  borderStyle: z.enum(["solid", "dashed", "dotted"]).optional(),
});

export const nodePresentationSchema = nodePresentationValueSchema
  .extend({
    breakpoints: z
      .object({
        tablet: nodePresentationValueSchema.optional(),
        mobile: nodePresentationValueSchema.optional(),
      })
      .optional(),
  })
  .optional();

export type NodePresentationValue = z.infer<typeof nodePresentationValueSchema>;
export type NodePresentation = z.infer<typeof nodePresentationSchema>;

export type NodePresentationBreakpoint = "tablet" | "mobile";
export type NodePresentationSizeMapper = (
  size: NonNullable<NodePresentationValue["size"]>,
) => string | undefined;

interface ResponsiveRule {
  selector: string;
  tablet?: ReadonlyArray<string>;
  mobile?: ReadonlyArray<string>;
}

interface BuildResponsiveCssInput {
  sectionId?: string;
  rules: ReadonlyArray<ResponsiveRule>;
}

function cleanDecls(
  decls: ReadonlyArray<string> | undefined,
): ReadonlyArray<string> {
  if (!decls || decls.length === 0) return [];
  return decls
    .map((decl) => decl.trim())
    .filter((decl) => decl.length > 0);
}

function escapeAttr(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function blockFor(
  scope: string,
  rules: ReadonlyArray<ResponsiveRule>,
  breakpoint: NodePresentationBreakpoint,
): string | null {
  const cssRules: string[] = [];
  for (const rule of rules) {
    const decls = cleanDecls(
      breakpoint === "tablet" ? rule.tablet : rule.mobile,
    );
    if (decls.length === 0) continue;
    const importantDecls = decls.map((decl) => `${decl} !important`).join(";");
    cssRules.push(`${scope} ${rule.selector}{${importantDecls};}`);
  }
  if (cssRules.length === 0) return null;
  const query = breakpoint === "tablet" ? "(max-width: 1023px)" : "(max-width: 640px)";
  return `@media ${query}{${cssRules.join("")}}`;
}

export function buildNodePresentationResponsiveCss(
  input: BuildResponsiveCssInput,
): string | null {
  if (!input.sectionId) return null;
  const scopedId = escapeAttr(input.sectionId);
  const scope = `[data-cms-section][data-section-id="${scopedId}"]`;
  const tabletBlock = blockFor(scope, input.rules, "tablet");
  const mobileBlock = blockFor(scope, input.rules, "mobile");
  const css = [tabletBlock, mobileBlock].filter(Boolean).join("");
  return css.length > 0 ? css : null;
}

function toneColor(tone: NodePresentationValue["tone"]): string | undefined {
  if (tone === "muted") {
    return "var(--token-color-muted, var(--impronta-muted, #8f877c))";
  }
  if (tone === "strong") {
    return "var(--token-color-text, var(--impronta-ink, currentColor))";
  }
  return undefined;
}

export function nodePresentationInlineStyle(
  value: NodePresentationValue | null | undefined,
  sizeMapper?: NodePresentationSizeMapper,
): CSSProperties | undefined {
  if (!value) return undefined;
  const style: CSSProperties = {};
  if (value.align) style.textAlign = value.align;
  if (value.maxWidthPx !== undefined) style.maxWidth = `${value.maxWidthPx}px`;
  if (value.marginTopPx !== undefined) style.marginTop = `${value.marginTopPx}px`;
  if (value.marginBottomPx !== undefined) {
    style.marginBottom = `${value.marginBottomPx}px`;
  }
  if (value.marginInlinePx !== undefined) {
    style.marginInline = `${value.marginInlinePx}px`;
  }
  if (value.marginLeftPx !== undefined) style.marginLeft = `${value.marginLeftPx}px`;
  if (value.marginRightPx !== undefined) {
    style.marginRight = `${value.marginRightPx}px`;
  }
  if (value.paddingTopPx !== undefined) style.paddingTop = `${value.paddingTopPx}px`;
  if (value.paddingBottomPx !== undefined) {
    style.paddingBottom = `${value.paddingBottomPx}px`;
  }
  if (value.paddingInlinePx !== undefined) {
    style.paddingInline = `${value.paddingInlinePx}px`;
  }
  if (value.paddingLeftPx !== undefined) {
    style.paddingLeft = `${value.paddingLeftPx}px`;
  }
  if (value.paddingRightPx !== undefined) {
    style.paddingRight = `${value.paddingRightPx}px`;
  }
  const size = value.size && sizeMapper ? sizeMapper(value.size) : undefined;
  if (size) style.fontSize = size;
  const color = toneColor(value.tone);
  if (color) style.color = color;
  // Free escapes — applied after the size/tone tokens so a raw value wins.
  if (value.fontFamily) style.fontFamily = value.fontFamily;
  if (value.fontSizePx !== undefined) style.fontSize = `${value.fontSizePx}px`;
  if (value.fontWeight !== undefined) style.fontWeight = value.fontWeight;
  if (value.letterSpacingPx !== undefined) {
    style.letterSpacing = `${value.letterSpacingPx}px`;
  }
  if (value.lineHeightPct !== undefined) style.lineHeight = value.lineHeightPct / 100;
  if (value.textTransform) style.textTransform = value.textTransform;
  // Advanced text controls.
  if (value.textWrap) {
    (style as Record<string, unknown>).textWrap = value.textWrap;
  }
  if (value.whiteSpace) style.whiteSpace = value.whiteSpace;
  if (value.lineClamp !== undefined && value.lineClamp > 0) {
    style.display = "-webkit-box";
    style.WebkitLineClamp = value.lineClamp;
    style.WebkitBoxOrient = "vertical";
    style.overflow = "hidden";
  }
  if (value.textColor) style.color = value.textColor;
  if (value.backgroundColor) style.backgroundColor = value.backgroundColor;
  if (
    value.borderColor ||
    value.borderWidthPx !== undefined ||
    value.borderStyle
  ) {
    style.borderStyle = value.borderStyle ?? "solid";
    style.borderWidth =
      value.borderWidthPx !== undefined ? `${value.borderWidthPx}px` : "1px";
    if (value.borderColor) style.borderColor = value.borderColor;
  }
  if (value.visibility === "hidden") style.display = "none";
  return Object.keys(style).length > 0 ? style : undefined;
}
