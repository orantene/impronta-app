import type { CSSProperties } from "react";
import { buildNodePresentationResponsiveCss } from "../shared/node-presentation";
import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import { Container, SectionHead } from "../shared/section-primitives";
import type { SectionComponentProps } from "../types";
import type { TrustStripV1 } from "./schema";

/**
 * Server-rendered trust strip. Pure CSS — no client JS.
 *
 * The three variants share a single layout skeleton and diverge on the
 * per-item render:
 *   - icon-row    → serif italic numerals ("01" / "02" / "03" / "04")
 *   - metrics-row → large stat + caption
 *   - logo-row    → uniform italic serif names (for press/client strips)
 *
 * Colors and radii pull from token CSS custom properties defined by the
 * token resolver (M7) so changing the theme preset repaints this section
 * without any code change.
 */

function textAlignFor(align?: "left" | "center" | "right"): CSSProperties["textAlign"] {
  if (align === "left") return "left";
  if (align === "right") return "right";
  if (align === "center") return "center";
  return undefined;
}

function textToneColor(
  tone?: "default" | "muted" | "strong",
): CSSProperties["color"] {
  if (tone === "muted") return "var(--token-color-muted)";
  if (tone === "strong") return "var(--foreground)";
  return undefined;
}

function headingSize(size?: "sm" | "md" | "lg" | "xl" | "display"): CSSProperties["fontSize"] {
  if (size === "sm") return "clamp(1.45rem, 3.2vw, 2.2rem)";
  if (size === "lg") return "clamp(2.1rem, 4.8vw, 3.4rem)";
  if (size === "xl") return "clamp(2.4rem, 5.5vw, 3.9rem)";
  return undefined;
}

function eyebrowSize(size?: "sm" | "md" | "lg" | "xl" | "display"): CSSProperties["fontSize"] {
  if (size === "sm") return "0.66rem";
  if (size === "lg") return "0.84rem";
  if (size === "xl") return "0.92rem";
  return undefined;
}

function visibilityDisplay(
  visibility?: "visible" | "hidden",
): CSSProperties["display"] {
  if (visibility === "hidden") return "none";
  return undefined;
}

function toCssDecls(style: CSSProperties): string[] {
  const decls: string[] = [];
  if (style.textAlign) decls.push(`text-align:${style.textAlign}`);
  if (style.maxWidth) decls.push(`max-width:${style.maxWidth}`);
  if (style.marginTop) decls.push(`margin-top:${style.marginTop}`);
  if (style.marginBottom) decls.push(`margin-bottom:${style.marginBottom}`);
  if (style.marginInline) decls.push(`margin-inline:${style.marginInline}`);
  if (style.marginLeft) decls.push(`margin-left:${style.marginLeft}`);
  if (style.marginRight) decls.push(`margin-right:${style.marginRight}`);
  if (style.paddingTop) decls.push(`padding-top:${style.paddingTop}`);
  if (style.paddingBottom) decls.push(`padding-bottom:${style.paddingBottom}`);
  if (style.paddingInline) decls.push(`padding-inline:${style.paddingInline}`);
  if (style.paddingLeft) decls.push(`padding-left:${style.paddingLeft}`);
  if (style.paddingRight) decls.push(`padding-right:${style.paddingRight}`);
  if (style.fontSize) decls.push(`font-size:${style.fontSize}`);
  if (style.color) decls.push(`color:${style.color}`);
  if (style.display) decls.push(`display:${style.display}`);
  return decls;
}

function textNodeDecls(
  node:
    | {
        align?: "left" | "center" | "right";
        maxWidthPx?: number;
        marginTopPx?: number;
        marginBottomPx?: number;
        marginInlinePx?: number;
        marginLeftPx?: number;
        marginRightPx?: number;
        paddingTopPx?: number;
        paddingBottomPx?: number;
        paddingInlinePx?: number;
        paddingLeftPx?: number;
        paddingRightPx?: number;
        size?: "sm" | "md" | "lg" | "xl" | "display";
        tone?: "default" | "muted" | "strong";
        visibility?: "visible" | "hidden";
      }
    | undefined,
  sizeMapper: (size?: "sm" | "md" | "lg" | "xl" | "display") => CSSProperties["fontSize"] = headingSize,
): string[] {
  if (!node) return [];
  const hasMarginSides =
    typeof node.marginLeftPx === "number" ||
    typeof node.marginRightPx === "number";
  const hasPaddingSides =
    typeof node.paddingLeftPx === "number" ||
    typeof node.paddingRightPx === "number";
  return toCssDecls({
    textAlign: textAlignFor(node.align),
    maxWidth: node.maxWidthPx ? `${node.maxWidthPx}px` : undefined,
    marginTop: typeof node.marginTopPx === "number" ? `${node.marginTopPx}px` : undefined,
    marginBottom:
      typeof node.marginBottomPx === "number" ? `${node.marginBottomPx}px` : undefined,
    marginInline:
      !hasMarginSides && typeof node.marginInlinePx === "number"
        ? `${node.marginInlinePx}px`
        : undefined,
    marginLeft:
      typeof node.marginLeftPx === "number" ? `${node.marginLeftPx}px` : undefined,
    marginRight:
      typeof node.marginRightPx === "number" ? `${node.marginRightPx}px` : undefined,
    paddingTop:
      typeof node.paddingTopPx === "number" ? `${node.paddingTopPx}px` : undefined,
    paddingBottom:
      typeof node.paddingBottomPx === "number"
        ? `${node.paddingBottomPx}px`
        : undefined,
    paddingInline:
      !hasPaddingSides && typeof node.paddingInlinePx === "number"
        ? `${node.paddingInlinePx}px`
        : undefined,
    paddingLeft:
      typeof node.paddingLeftPx === "number" ? `${node.paddingLeftPx}px` : undefined,
    paddingRight:
      typeof node.paddingRightPx === "number" ? `${node.paddingRightPx}px` : undefined,
    fontSize: sizeMapper(node.size),
    color: textToneColor(node.tone),
    display:
      node.visibility === "visible"
        ? "revert"
        : visibilityDisplay(node.visibility),
  });
}

function sectionHeadAlignDecls(align?: "left" | "center" | "right"): string[] {
  if (align === "left") {
    return ["text-align:left", "align-items:flex-start", "margin-inline:0"];
  }
  if (align === "right") {
    return ["text-align:right", "align-items:flex-end", "margin-inline:0"];
  }
  if (align === "center") {
    return ["text-align:center", "align-items:center", "margin-inline:auto"];
  }
  return [];
}

export function TrustStripComponent({
  props,
  sectionId,
  builderNodeBindings,
}: SectionComponentProps<TrustStripV1>) {
  const {
    eyebrow,
    headline,
    items,
    variant,
    background,
    density,
    presentation,
    nodePresentation,
  } = props;
  const bg = background ?? "neutral";
  const den = density ?? undefined;
  const nodeIdsByRole = builderNodeBindings?.nodeIdsByRole;
  const eyebrowNode = nodePresentation?.subheadline;
  const headlineNode = nodePresentation?.headline;
  const responsiveCss = buildNodePresentationResponsiveCss({
    sectionId,
    rules: [
      {
        selector: ".site-eyebrow > span",
        tablet: textNodeDecls(eyebrowNode?.breakpoints?.tablet, eyebrowSize),
        mobile: textNodeDecls(eyebrowNode?.breakpoints?.mobile, eyebrowSize),
      },
      {
        selector: ".site-prim-head",
        tablet: sectionHeadAlignDecls(headlineNode?.breakpoints?.tablet?.align),
        mobile: sectionHeadAlignDecls(headlineNode?.breakpoints?.mobile?.align),
      },
      {
        selector: ".site-prim-head__headline > span",
        tablet: textNodeDecls(headlineNode?.breakpoints?.tablet, headingSize),
        mobile: textNodeDecls(headlineNode?.breakpoints?.mobile, headingSize),
      },
    ],
  });
  return (
    <section
      className="site-trust-strip"
      data-variant={variant}
      data-background={bg}
      data-density={den}
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      {responsiveCss ? (
        <style dangerouslySetInnerHTML={{ __html: responsiveCss }} />
      ) : null}
      <Container width="standard">
        <SectionHead
          align={headlineNode?.align === "left" ? "start" : "center"}
          eyebrow={
            eyebrow ? (
              <span
                style={{
                  display: visibilityDisplay(eyebrowNode?.visibility) ?? "inline-block",
                  textAlign: textAlignFor(eyebrowNode?.align),
                  maxWidth: eyebrowNode?.maxWidthPx
                    ? `${eyebrowNode.maxWidthPx}px`
                    : undefined,
                  marginTop:
                    typeof eyebrowNode?.marginTopPx === "number"
                      ? `${eyebrowNode.marginTopPx}px`
                      : undefined,
                  marginBottom:
                    typeof eyebrowNode?.marginBottomPx === "number"
                      ? `${eyebrowNode.marginBottomPx}px`
                      : undefined,
                  marginInline:
                    typeof eyebrowNode?.marginLeftPx !== "number" &&
                    typeof eyebrowNode?.marginRightPx !== "number" &&
                    typeof eyebrowNode?.marginInlinePx === "number"
                      ? `${eyebrowNode.marginInlinePx}px`
                      : undefined,
                  marginLeft:
                    typeof eyebrowNode?.marginLeftPx === "number"
                      ? `${eyebrowNode.marginLeftPx}px`
                      : undefined,
                  marginRight:
                    typeof eyebrowNode?.marginRightPx === "number"
                      ? `${eyebrowNode.marginRightPx}px`
                      : undefined,
                  paddingTop:
                    typeof eyebrowNode?.paddingTopPx === "number"
                      ? `${eyebrowNode.paddingTopPx}px`
                      : undefined,
                  paddingBottom:
                    typeof eyebrowNode?.paddingBottomPx === "number"
                      ? `${eyebrowNode.paddingBottomPx}px`
                      : undefined,
                  paddingInline:
                    typeof eyebrowNode?.paddingLeftPx !== "number" &&
                    typeof eyebrowNode?.paddingRightPx !== "number" &&
                    typeof eyebrowNode?.paddingInlinePx === "number"
                      ? `${eyebrowNode.paddingInlinePx}px`
                      : undefined,
                  paddingLeft:
                    typeof eyebrowNode?.paddingLeftPx === "number"
                      ? `${eyebrowNode.paddingLeftPx}px`
                      : undefined,
                  paddingRight:
                    typeof eyebrowNode?.paddingRightPx === "number"
                      ? `${eyebrowNode.paddingRightPx}px`
                      : undefined,
                  fontSize: eyebrowSize(eyebrowNode?.size),
                  color: textToneColor(eyebrowNode?.tone),
                }}
              >
                {renderInlineRich(eyebrow)}
              </span>
            ) : undefined
          }
          headline={
            headline ? (
              <span
                style={{
                  display: visibilityDisplay(headlineNode?.visibility) ?? "inline-block",
                  textAlign: textAlignFor(headlineNode?.align),
                  maxWidth: headlineNode?.maxWidthPx
                    ? `${headlineNode.maxWidthPx}px`
                    : undefined,
                  marginTop:
                    typeof headlineNode?.marginTopPx === "number"
                      ? `${headlineNode.marginTopPx}px`
                      : undefined,
                  marginBottom:
                    typeof headlineNode?.marginBottomPx === "number"
                      ? `${headlineNode.marginBottomPx}px`
                      : undefined,
                  marginInline:
                    typeof headlineNode?.marginLeftPx !== "number" &&
                    typeof headlineNode?.marginRightPx !== "number" &&
                    typeof headlineNode?.marginInlinePx === "number"
                      ? `${headlineNode.marginInlinePx}px`
                      : undefined,
                  marginLeft:
                    typeof headlineNode?.marginLeftPx === "number"
                      ? `${headlineNode.marginLeftPx}px`
                      : undefined,
                  marginRight:
                    typeof headlineNode?.marginRightPx === "number"
                      ? `${headlineNode.marginRightPx}px`
                      : undefined,
                  paddingTop:
                    typeof headlineNode?.paddingTopPx === "number"
                      ? `${headlineNode.paddingTopPx}px`
                      : undefined,
                  paddingBottom:
                    typeof headlineNode?.paddingBottomPx === "number"
                      ? `${headlineNode.paddingBottomPx}px`
                      : undefined,
                  paddingInline:
                    typeof headlineNode?.paddingLeftPx !== "number" &&
                    typeof headlineNode?.paddingRightPx !== "number" &&
                    typeof headlineNode?.paddingInlinePx === "number"
                      ? `${headlineNode.paddingInlinePx}px`
                      : undefined,
                  paddingLeft:
                    typeof headlineNode?.paddingLeftPx === "number"
                      ? `${headlineNode.paddingLeftPx}px`
                      : undefined,
                  paddingRight:
                    typeof headlineNode?.paddingRightPx === "number"
                      ? `${headlineNode.paddingRightPx}px`
                      : undefined,
                  fontSize: headingSize(headlineNode?.size),
                  color: textToneColor(headlineNode?.tone),
                }}
              >
                {renderInlineRich(headline)}
              </span>
            ) : undefined
          }
          eyebrowBuilderNodeId={nodeIdsByRole?.subheadline}
          headlineBuilderNodeId={nodeIdsByRole?.headline}
        />
        <div className="site-trust-strip__grid" data-count={items.length}>
          {items.map((item, i) => (
            <div key={`${item.label}-${i}`} className="site-trust-strip__item">
              {variant === "icon-row" ? (
                <span className="site-trust-strip__numeral" aria-hidden>
                  {String(i + 1).padStart(2, "0")}
                </span>
              ) : null}
              {variant === "metrics-row" && item.stat ? (
                <span className="site-trust-strip__stat">{item.stat}</span>
              ) : null}
              <h3 className="site-trust-strip__label">{item.label}</h3>
              {item.detail ? (
                <p className="site-trust-strip__detail">{item.detail}</p>
              ) : null}
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
