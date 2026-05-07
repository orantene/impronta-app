import type { CSSProperties } from "react";
import { buildNodePresentationResponsiveCss } from "../shared/node-presentation";
import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import { Cta } from "../shared/section-primitives";
import type { SectionComponentProps } from "../types";
import type { SplitScreenV1 } from "./schema";

/**
 * Phase E (Batch 2) — split_screen's `__inner` is a 2-column flex
 * wrapper for `__media` + `__copy`, not a generic content container,
 * so it intentionally does NOT use the standard Container primitive.
 * Only the CTAs adopt the shared Cta primitive — the variant-driven
 * column layout (50/50, 40/60, 60/40, edge-to-edge), sticky media,
 * and side-flip mechanics are the section's signature and stay.
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

function headingSize(size?: "sm" | "md" | "lg" | "xl"): CSSProperties["fontSize"] {
  if (size === "sm") return "clamp(1.45rem, 3.2vw, 2.2rem)";
  if (size === "lg") return "clamp(2.05rem, 4.6vw, 3.25rem)";
  if (size === "xl") return "clamp(2.35rem, 5.2vw, 3.7rem)";
  return undefined;
}

function eyebrowSize(size?: "sm" | "md" | "lg" | "xl"): CSSProperties["fontSize"] {
  if (size === "sm") return "0.82rem";
  if (size === "lg") return "1rem";
  if (size === "xl") return "1.08rem";
  return undefined;
}

function paragraphSize(size?: "sm" | "md" | "lg" | "xl"): CSSProperties["fontSize"] {
  if (size === "sm") return "0.94rem";
  if (size === "lg") return "1.1rem";
  if (size === "xl") return "1.2rem";
  return undefined;
}

function ctaSize(
  size?: "sm" | "md" | "lg" | "xl",
): Pick<CSSProperties, "padding" | "fontSize"> {
  if (size === "sm") return { padding: "0.64rem 1.14rem", fontSize: "0.84rem" };
  if (size === "lg") return { padding: "0.95rem 1.8rem", fontSize: "1rem" };
  if (size === "xl") return { padding: "1.06rem 2rem", fontSize: "1.03rem" };
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
        size?: "sm" | "md" | "lg" | "xl";
        tone?: "default" | "muted" | "strong";
        visibility?: "visible" | "hidden";
      }
    | undefined,
  sizeMapper: (size?: "sm" | "md" | "lg" | "xl") => CSSProperties["fontSize"],
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
        size?: "sm" | "md" | "lg" | "xl";
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
        size?: "sm" | "md" | "lg" | "xl";
        tone?: "default" | "muted" | "strong";
        visibility?: "visible" | "hidden";
      }
    | undefined,
  sizeMapper: (size?: "sm" | "md" | "lg" | "xl") => CSSProperties["fontSize"],
): string[] {
  if (!node) return [];
  return toCssDecls(textNodeStyle(node, sizeMapper));
}

function ctaDecls(
  node:
    | {
        size?: "sm" | "md" | "lg" | "xl";
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

export function SplitScreenComponent({
  props,
  sectionId,
  builderNodeBindings,
}: SectionComponentProps<SplitScreenV1>) {
  const {
    eyebrow,
    headline,
    body,
    primaryCta,
    secondaryCta,
    imageUrl,
    imageAlt,
    videoUrl,
    side,
    variant,
    verticalAlign,
    stickyMedia,
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
        selector: ".site-split__copy",
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
        selector: ".site-split__headline > span",
        tablet: textNodeDecls(headlineNode?.breakpoints?.tablet, headingSize),
        mobile: textNodeDecls(headlineNode?.breakpoints?.mobile, headingSize),
      },
      {
        selector: ".site-split__body",
        tablet: textNodeDecls(copyNode?.breakpoints?.tablet, paragraphSize),
        mobile: textNodeDecls(copyNode?.breakpoints?.mobile, paragraphSize),
      },
      {
        selector: ".site-split__ctas",
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
        selector: ".site-split__ctas [data-cta-variant=\"primary\"]",
        tablet: ctaDecls(primaryCtaNode?.breakpoints?.tablet),
        mobile: ctaDecls(primaryCtaNode?.breakpoints?.mobile),
      },
      {
        selector: ".site-split__ctas [data-cta-variant=\"ghost\"]",
        tablet: ctaDecls(secondaryCtaNode?.breakpoints?.tablet),
        mobile: ctaDecls(secondaryCtaNode?.breakpoints?.mobile),
      },
    ],
  });

  const Media = videoUrl ? (
    <video
      className="site-split__media-el"
      src={videoUrl}
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
    />
  ) : imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="site-split__media-el"
      src={imageUrl}
      alt={imageAlt ?? ""}
      loading="lazy"
    />
  ) : null;

  return (
    <section
      className="site-split"
      data-side={side}
      data-variant={variant}
      data-valign={verticalAlign}
      data-sticky={stickyMedia ? "true" : "false"}
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      {responsiveCss ? (
        <style dangerouslySetInnerHTML={{ __html: responsiveCss }} />
      ) : null}
      <div className="site-split__inner">
        <div className="site-split__media">
          <div
            className={
              stickyMedia ? "site-split__media-stick" : "site-split__media-frame"
            }
          >
            {Media}
          </div>
        </div>
        <div
          className="site-split__copy"
          style={{ textAlign: textAlignFor(headlineNode?.align) }}
        >
          {eyebrow ? (
            <span className="site-eyebrow" data-builder-node-id={nodeIdsByRole?.subheadline}>
              <span style={textNodeStyle(eyebrowNode, eyebrowSize)}>
                {renderInlineRich(eyebrow)}
              </span>
            </span>
          ) : null}
          <h2 className="site-split__headline" data-builder-node-id={nodeIdsByRole?.headline}>
            <span style={textNodeStyle(headlineNode, headingSize)}>
              {renderInlineRich(headline)}
            </span>
          </h2>
          {body ? (
            <div
              className="site-split__body"
              data-builder-node-id={nodeIdsByRole?.copy}
              style={textNodeStyle(copyNode, paragraphSize)}
            >
              {body.split("\n\n").map((p, i) => (
                <p key={i}>{renderInlineRich(p)}</p>
              ))}
            </div>
          ) : null}
          {(primaryCta || secondaryCta) && (
            <div
              className="site-prim-ctas site-split__ctas"
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
                <Cta
                  href={primaryCta.href}
                  variant="primary"
                  builderNodeId={nodeIdsByRole?.primaryCta}
                  style={ctaNodeStyle(primaryCtaNode)}
                >
                  {primaryCta.label}
                </Cta>
              ) : null}
              {secondaryCta ? (
                <Cta
                  href={secondaryCta.href}
                  variant="ghost"
                  builderNodeId={nodeIdsByRole?.secondaryCta}
                  style={ctaNodeStyle(secondaryCtaNode)}
                >
                  {secondaryCta.label}
                </Cta>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
