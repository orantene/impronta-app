import { z } from "zod";

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
