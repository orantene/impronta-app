/**
 * Phase E (Final Batch 3) — partial head alignment.
 *
 * The eyebrow already emits `site-eyebrow` — the same class SectionHead
 * produces — so it is already phase-aligned. The headline is a page-level
 * <h1> (hero semantics) inside the split-grid copy column; migrating it to
 * SectionHead would impose an <h2> and collapse the split-grid layout.
 * No SectionHead import needed: both head tokens are correct by class.
 */
import type { CSSProperties } from "react";
import { buildNodePresentationResponsiveCss } from "../shared/node-presentation";
import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import type { SectionComponentProps } from "../types";
import type { HeroSplitV1 } from "./schema";

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
  if (size === "display") return "clamp(3.5rem, 6vw, 6rem)";
  return undefined;
}

function eyebrowSize(size?: "sm" | "md" | "lg" | "xl" | "display"): CSSProperties["fontSize"] {
  if (size === "sm") return "0.82rem";
  if (size === "lg") return "1rem";
  if (size === "xl") return "1.08rem";
  if (size === "display") return "1.08rem";
  return undefined;
}

function paragraphSize(size?: "sm" | "md" | "lg" | "xl" | "display"): CSSProperties["fontSize"] {
  if (size === "sm") return "0.94rem";
  if (size === "lg") return "1.1rem";
  if (size === "xl") return "1.2rem";
  if (size === "display") return "clamp(2rem, 4vw, 4.5rem)";
  return undefined;
}

function ctaSize(
  size?: "sm" | "md" | "lg" | "xl" | "display",
): Pick<CSSProperties, "padding" | "fontSize"> {
  if (size === "sm") return { padding: "0.64rem 1.14rem", fontSize: "0.84rem" };
  if (size === "lg") return { padding: "0.95rem 1.8rem", fontSize: "1rem" };
  if (size === "xl") return { padding: "1.06rem 2rem", fontSize: "1.03rem" };
  if (size === "display") return { padding: "1.06rem 2rem", fontSize: "1.03rem" };
  return {};
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
  if (style.justifyContent) decls.push(`justify-content:${style.justifyContent}`);
  return decls;
}

function textNodeStyle(
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
): CSSProperties {
  return {
    display: visibilityDisplay(node?.visibility) ?? "inline-block",
    textAlign: textAlignFor(node?.align),
    maxWidth: node?.maxWidthPx ? `${node.maxWidthPx}px` : undefined,
    marginTop: typeof node?.marginTopPx === "number" ? `${node.marginTopPx}px` : undefined,
    marginBottom:
      typeof node?.marginBottomPx === "number" ? `${node.marginBottomPx}px` : undefined,
    marginInline:
      typeof node?.marginLeftPx !== "number" &&
      typeof node?.marginRightPx !== "number" &&
      typeof node?.marginInlinePx === "number"
        ? `${node.marginInlinePx}px`
        : undefined,
    marginLeft: typeof node?.marginLeftPx === "number" ? `${node.marginLeftPx}px` : undefined,
    marginRight:
      typeof node?.marginRightPx === "number" ? `${node.marginRightPx}px` : undefined,
    paddingTop: typeof node?.paddingTopPx === "number" ? `${node.paddingTopPx}px` : undefined,
    paddingBottom:
      typeof node?.paddingBottomPx === "number" ? `${node.paddingBottomPx}px` : undefined,
    paddingInline:
      typeof node?.paddingLeftPx !== "number" &&
      typeof node?.paddingRightPx !== "number" &&
      typeof node?.paddingInlinePx === "number"
        ? `${node.paddingInlinePx}px`
        : undefined,
    paddingLeft:
      typeof node?.paddingLeftPx === "number" ? `${node.paddingLeftPx}px` : undefined,
    paddingRight:
      typeof node?.paddingRightPx === "number" ? `${node.paddingRightPx}px` : undefined,
    fontSize: sizeMapper(node?.size),
    color: textToneColor(node?.tone),
  };
}

function ctaNodeStyle(
  node:
    | {
        size?: "sm" | "md" | "lg" | "xl" | "display";
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
        visibility?: "visible" | "hidden";
      }
    | undefined,
): CSSProperties {
  return {
    ...ctaSize(node?.size),
    marginTop: typeof node?.marginTopPx === "number" ? `${node.marginTopPx}px` : undefined,
    marginBottom:
      typeof node?.marginBottomPx === "number" ? `${node.marginBottomPx}px` : undefined,
    marginInline:
      typeof node?.marginLeftPx !== "number" &&
      typeof node?.marginRightPx !== "number" &&
      typeof node?.marginInlinePx === "number"
        ? `${node.marginInlinePx}px`
        : undefined,
    marginLeft: typeof node?.marginLeftPx === "number" ? `${node.marginLeftPx}px` : undefined,
    marginRight:
      typeof node?.marginRightPx === "number" ? `${node.marginRightPx}px` : undefined,
    paddingTop: typeof node?.paddingTopPx === "number" ? `${node.paddingTopPx}px` : undefined,
    paddingBottom:
      typeof node?.paddingBottomPx === "number" ? `${node.paddingBottomPx}px` : undefined,
    paddingInline:
      typeof node?.paddingLeftPx !== "number" &&
      typeof node?.paddingRightPx !== "number" &&
      typeof node?.paddingInlinePx === "number"
        ? `${node.paddingInlinePx}px`
        : undefined,
    paddingLeft:
      typeof node?.paddingLeftPx === "number" ? `${node.paddingLeftPx}px` : undefined,
    paddingRight:
      typeof node?.paddingRightPx === "number" ? `${node.paddingRightPx}px` : undefined,
    display: visibilityDisplay(node?.visibility),
  };
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
  return toCssDecls(textNodeStyle(node, sizeMapper));
}

function ctaDecls(
  node:
    | {
        size?: "sm" | "md" | "lg" | "xl" | "display";
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
        visibility?: "visible" | "hidden";
      }
    | undefined,
): string[] {
  if (!node) return [];
  return toCssDecls(ctaNodeStyle(node));
}

function ctaRowAlignDecls(align?: "left" | "center" | "right"): string[] {
  if (align === "left") return ["justify-content:flex-start"];
  if (align === "right") return ["justify-content:flex-end"];
  if (align === "center") return ["justify-content:center"];
  return [];
}

export function HeroSplitComponent({
  props,
  sectionId,
  builderNodeBindings,
}: SectionComponentProps<HeroSplitV1>) {
  const {
    eyebrow,
    headline,
    subheadline,
    primaryCta,
    secondaryCta,
    imageUrl,
    imageAlt,
    side,
    variant,
    nodePresentation,
    presentation,
  } = props;
  const nodeIdsByRole = builderNodeBindings?.nodeIdsByRole;
  const eyebrowNode = nodePresentation?.subheadline;
  const headlineNode = nodePresentation?.headline;
  const copyNode = nodePresentation?.copy;
  const primaryCtaNode = nodePresentation?.primaryCta;
  const secondaryCtaNode = nodePresentation?.secondaryCta;
  const ctaAlign = primaryCtaNode?.align ?? secondaryCtaNode?.align;
  const responsiveCss = buildNodePresentationResponsiveCss({
    sectionId,
    rules: [
      {
        selector: ".site-hero-split__copy",
        tablet: ctaRowAlignDecls(
          headlineNode?.breakpoints?.tablet?.align ??
            eyebrowNode?.breakpoints?.tablet?.align ??
            copyNode?.breakpoints?.tablet?.align,
        ),
        mobile: ctaRowAlignDecls(
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
        selector: ".site-hero-split__headline > span",
        tablet: textNodeDecls(headlineNode?.breakpoints?.tablet, headingSize),
        mobile: textNodeDecls(headlineNode?.breakpoints?.mobile, headingSize),
      },
      {
        selector: ".site-hero-split__sub > span",
        tablet: textNodeDecls(copyNode?.breakpoints?.tablet, paragraphSize),
        mobile: textNodeDecls(copyNode?.breakpoints?.mobile, paragraphSize),
      },
      {
        selector: ".site-hero-split__ctas",
        tablet: ctaRowAlignDecls(
          primaryCtaNode?.breakpoints?.tablet?.align ??
            secondaryCtaNode?.breakpoints?.tablet?.align,
        ),
        mobile: ctaRowAlignDecls(
          primaryCtaNode?.breakpoints?.mobile?.align ??
            secondaryCtaNode?.breakpoints?.mobile?.align,
        ),
      },
      {
        selector: ".site-hero-split__ctas .site-btn--primary",
        tablet: ctaDecls(primaryCtaNode?.breakpoints?.tablet),
        mobile: ctaDecls(primaryCtaNode?.breakpoints?.mobile),
      },
      {
        selector: ".site-hero-split__ctas .site-btn--ghost",
        tablet: ctaDecls(secondaryCtaNode?.breakpoints?.tablet),
        mobile: ctaDecls(secondaryCtaNode?.breakpoints?.mobile),
      },
    ],
  });
  return (
    <section
      className="site-hero-split"
      data-side={side}
      data-variant={variant}
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      {responsiveCss ? (
        <style dangerouslySetInnerHTML={{ __html: responsiveCss }} />
      ) : null}
      <div className="site-hero-split__inner">
        <div
          className="site-hero-split__copy"
          style={{ textAlign: textAlignFor(headlineNode?.align) }}
        >
          {eyebrow ? (
            <span className="site-eyebrow" data-builder-node-id={nodeIdsByRole?.subheadline}>
              <span style={textNodeStyle(eyebrowNode, eyebrowSize)}>
                {renderInlineRich(eyebrow)}
              </span>
            </span>
          ) : null}
          <h1 className="site-hero-split__headline" data-builder-node-id={nodeIdsByRole?.headline}>
            <span style={textNodeStyle(headlineNode, headingSize)}>
              {renderInlineRich(headline)}
            </span>
          </h1>
          {subheadline ? (
            <p className="site-hero-split__sub" data-builder-node-id={nodeIdsByRole?.copy}>
              <span style={textNodeStyle(copyNode, paragraphSize)}>
                {renderInlineRich(subheadline)}
              </span>
            </p>
          ) : null}
          {(primaryCta || secondaryCta) && (
            <div
              className="site-hero-split__ctas"
              style={{
                justifyContent:
                  ctaAlign === "left"
                    ? "flex-start"
                    : ctaAlign === "right"
                      ? "flex-end"
                      : ctaAlign === "center"
                        ? "center"
                        : undefined,
              }}
            >
              {primaryCta ? (
                <a
                  className="site-btn site-btn--primary"
                  href={primaryCta.href}
                  data-builder-node-id={nodeIdsByRole?.primaryCta}
                  style={ctaNodeStyle(primaryCtaNode)}
                >
                  {primaryCta.label}
                </a>
              ) : null}
              {secondaryCta ? (
                <a
                  className="site-btn site-btn--ghost"
                  href={secondaryCta.href}
                  data-builder-node-id={nodeIdsByRole?.secondaryCta}
                  style={ctaNodeStyle(secondaryCtaNode)}
                >
                  {secondaryCta.label}
                </a>
              ) : null}
            </div>
          )}
        </div>
        <div className="site-hero-split__media">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={imageAlt ?? ""}
            aria-hidden={imageAlt ? undefined : true}
            loading="eager"
          />
        </div>
      </div>
    </section>
  );
}
