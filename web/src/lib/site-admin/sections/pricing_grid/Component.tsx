import type { CSSProperties } from "react";
import { buildNodePresentationResponsiveCss } from "../shared/node-presentation";
import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import { Container, Cta, SectionHead } from "../shared/section-primitives";
import type { SectionComponentProps } from "../types";
import type { PricingGridV1 } from "./schema";

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
  if (size === "lg") return "clamp(2.05rem, 4.6vw, 3.25rem)";
  if (size === "xl") return "clamp(2.35rem, 5.2vw, 3.7rem)";
  return undefined;
}

function eyebrowSize(size?: "sm" | "md" | "lg" | "xl" | "display"): CSSProperties["fontSize"] {
  if (size === "sm") return "0.82rem";
  if (size === "lg") return "1rem";
  if (size === "xl") return "1.08rem";
  return undefined;
}

function paragraphSize(size?: "sm" | "md" | "lg" | "xl" | "display"): CSSProperties["fontSize"] {
  if (size === "sm") return "0.94rem";
  if (size === "lg") return "1.1rem";
  if (size === "xl") return "1.2rem";
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
  sizeMapper: (size?: "sm" | "md" | "lg" | "xl" | "display") => CSSProperties["fontSize"],
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
      typeof node.marginBottomPx === "number"
        ? `${node.marginBottomPx}px`
        : undefined,
    marginInline:
      !hasMarginSides && typeof node.marginInlinePx === "number"
        ? `${node.marginInlinePx}px`
        : undefined,
    marginLeft:
      typeof node.marginLeftPx === "number"
        ? `${node.marginLeftPx}px`
        : undefined,
    marginRight:
      typeof node.marginRightPx === "number"
        ? `${node.marginRightPx}px`
        : undefined,
    paddingTop:
      typeof node.paddingTopPx === "number"
        ? `${node.paddingTopPx}px`
        : undefined,
    paddingBottom:
      typeof node.paddingBottomPx === "number"
        ? `${node.paddingBottomPx}px`
        : undefined,
    paddingInline:
      !hasPaddingSides && typeof node.paddingInlinePx === "number"
        ? `${node.paddingInlinePx}px`
        : undefined,
    paddingLeft:
      typeof node.paddingLeftPx === "number"
        ? `${node.paddingLeftPx}px`
        : undefined,
    paddingRight:
      typeof node.paddingRightPx === "number"
        ? `${node.paddingRightPx}px`
        : undefined,
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

export function PricingGridComponent({
  props,
  sectionId,
  builderNodeBindings,
}: SectionComponentProps<PricingGridV1>) {
  const { eyebrow, headline, intro, plans, variant, nodePresentation, presentation } = props;
  const nodeIdsByRole = builderNodeBindings?.nodeIdsByRole;
  const eyebrowNode = nodePresentation?.subheadline;
  const headlineNode = nodePresentation?.headline;
  const copyNode = nodePresentation?.copy;
  const responsiveCss = buildNodePresentationResponsiveCss({
    sectionId,
    rules: [
      {
        selector: ".site-prim-head",
        tablet: sectionHeadAlignDecls(
          headlineNode?.breakpoints?.tablet?.align ??
            eyebrowNode?.breakpoints?.tablet?.align ??
            copyNode?.breakpoints?.tablet?.align,
        ),
        mobile: sectionHeadAlignDecls(
          headlineNode?.breakpoints?.mobile?.align ??
            eyebrowNode?.breakpoints?.mobile?.align ??
            copyNode?.breakpoints?.mobile?.align,
        ),
      },
      {
        selector: ".site-eyebrow > span",
        tablet: textNodeDecls(eyebrowNode?.breakpoints?.tablet, eyebrowSize),
        mobile: textNodeDecls(eyebrowNode?.breakpoints?.mobile, eyebrowSize),
      },
      {
        selector: ".site-prim-head__headline > span",
        tablet: textNodeDecls(headlineNode?.breakpoints?.tablet, headingSize),
        mobile: textNodeDecls(headlineNode?.breakpoints?.mobile, headingSize),
      },
      {
        selector: ".site-prim-head__intro > span",
        tablet: textNodeDecls(copyNode?.breakpoints?.tablet, paragraphSize),
        mobile: textNodeDecls(copyNode?.breakpoints?.mobile, paragraphSize),
      },
    ],
  });
  return (
    <section
      className="site-pricing"
      data-variant={variant}
      data-cols={plans.length}
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      {responsiveCss ? (
        <style dangerouslySetInnerHTML={{ __html: responsiveCss }} />
      ) : null}
      <Container width="standard">
        {(eyebrow || headline || intro) && (
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
            intro={
              intro ? (
                <span
                  style={{
                    display: visibilityDisplay(copyNode?.visibility) ?? "inline-block",
                    textAlign: textAlignFor(copyNode?.align),
                    maxWidth: copyNode?.maxWidthPx
                      ? `${copyNode.maxWidthPx}px`
                      : undefined,
                    marginTop:
                      typeof copyNode?.marginTopPx === "number"
                        ? `${copyNode.marginTopPx}px`
                        : undefined,
                    marginBottom:
                      typeof copyNode?.marginBottomPx === "number"
                        ? `${copyNode.marginBottomPx}px`
                        : undefined,
                    marginInline:
                      typeof copyNode?.marginLeftPx !== "number" &&
                      typeof copyNode?.marginRightPx !== "number" &&
                      typeof copyNode?.marginInlinePx === "number"
                        ? `${copyNode.marginInlinePx}px`
                        : undefined,
                    marginLeft:
                      typeof copyNode?.marginLeftPx === "number"
                        ? `${copyNode.marginLeftPx}px`
                        : undefined,
                    marginRight:
                      typeof copyNode?.marginRightPx === "number"
                        ? `${copyNode.marginRightPx}px`
                        : undefined,
                    paddingTop:
                      typeof copyNode?.paddingTopPx === "number"
                        ? `${copyNode.paddingTopPx}px`
                        : undefined,
                    paddingBottom:
                      typeof copyNode?.paddingBottomPx === "number"
                        ? `${copyNode.paddingBottomPx}px`
                        : undefined,
                    paddingInline:
                      typeof copyNode?.paddingLeftPx !== "number" &&
                      typeof copyNode?.paddingRightPx !== "number" &&
                      typeof copyNode?.paddingInlinePx === "number"
                        ? `${copyNode.paddingInlinePx}px`
                        : undefined,
                    paddingLeft:
                      typeof copyNode?.paddingLeftPx === "number"
                        ? `${copyNode.paddingLeftPx}px`
                        : undefined,
                    paddingRight:
                      typeof copyNode?.paddingRightPx === "number"
                        ? `${copyNode.paddingRightPx}px`
                        : undefined,
                    fontSize: paragraphSize(copyNode?.size),
                    color: textToneColor(copyNode?.tone),
                  }}
                >
                  {renderInlineRich(intro)}
                </span>
              ) : undefined
            }
            eyebrowBuilderNodeId={nodeIdsByRole?.subheadline}
            headlineBuilderNodeId={nodeIdsByRole?.headline}
            introBuilderNodeId={nodeIdsByRole?.copy}
          />
        )}
        <div className="site-pricing__grid">
          {plans.map((plan, i) => (
            <article
              key={`${plan.name}-${i}`}
              className="site-pricing__plan"
              data-highlighted={plan.highlighted ? "true" : "false"}
            >
              {plan.badge ? (
                <span className="site-pricing__badge">{plan.badge}</span>
              ) : null}
              <h3 className="site-pricing__name">{plan.name}</h3>
              <div className="site-pricing__price">
                <span className="site-pricing__amount">{plan.price}</span>
                {plan.cadence ? (
                  <span className="site-pricing__cadence">{plan.cadence}</span>
                ) : null}
              </div>
              {plan.description ? (
                <p className="site-pricing__desc">{plan.description}</p>
              ) : null}
              <ul className="site-pricing__features">
                {plan.features.map((f, k) => (
                  <li key={k}>
                    <span aria-hidden className="site-pricing__bullet">
                      ✓
                    </span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Cta
                href={plan.ctaHref}
                variant={plan.highlighted ? "primary" : "ghost"}
                className="site-pricing__cta"
              >
                {plan.ctaLabel}
              </Cta>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}
