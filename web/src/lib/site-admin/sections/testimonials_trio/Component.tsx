import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { buildNodePresentationResponsiveCss } from "../shared/node-presentation";
import { renderInlineRich } from "../shared/rich-text";
import { pickI18n } from "../shared/i18n-text";
import { Container, SectionHead } from "../shared/section-primitives";
import type { SectionComponentProps } from "../types";
import type { TestimonialsTrioV1, TestimonialsTrioItem } from "./schema";
import type { CSSProperties } from "react";

const AUTO_CYCLE: ReadonlyArray<NonNullable<TestimonialsTrioItem["accent"]>> = [
  "blush",
  "sage",
  "champagne",
  "ivory",
];

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
  if (size === "sm") return "clamp(1.45rem, 3.1vw, 2.2rem)";
  if (size === "lg") return "clamp(2.05rem, 4.5vw, 3.25rem)";
  if (size === "xl") return "clamp(2.35rem, 5.3vw, 3.75rem)";
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

/**
 * Phase E (Batch 3 halfway) — head-only migration. The 4-color accent
 * rotation, quote SVG, italic quote text, and footer-meta typography
 * remain bespoke. Only the eyebrow + headline rhythm is unified.
 */
export function TestimonialsTrioComponent({
  props,
  sectionId,
  locale,
  builderNodeBindings,
}: SectionComponentProps<TestimonialsTrioV1>) {
  const { items, variant, defaultAccent, presentation, nodePresentation } = props;
  const eyebrow = pickI18n(props.eyebrow, locale);
  const headline = pickI18n(props.headline, locale);
  const nodeIdsByRole = builderNodeBindings?.nodeIdsByRole;
  const eyebrowNode = nodePresentation?.subheadline;
  const headlineNode = nodePresentation?.headline;
  const responsiveCss = buildNodePresentationResponsiveCss({
    sectionId,
    rules: [
      {
        selector: ".site-prim-head",
        tablet: sectionHeadAlignDecls(
          headlineNode?.breakpoints?.tablet?.align ??
            eyebrowNode?.breakpoints?.tablet?.align,
        ),
        mobile: sectionHeadAlignDecls(
          headlineNode?.breakpoints?.mobile?.align ??
            eyebrowNode?.breakpoints?.mobile?.align,
        ),
      },
      {
        selector: ".site-eyebrow > span",
        tablet: textNodeDecls(eyebrowNode?.breakpoints?.tablet, eyebrowSize),
        mobile: textNodeDecls(eyebrowNode?.breakpoints?.mobile, eyebrowSize),
      },
      {
        selector: ".site-prim-head__headline > span",
        tablet: textNodeDecls(headlineNode?.breakpoints?.tablet),
        mobile: textNodeDecls(headlineNode?.breakpoints?.mobile),
      },
    ],
  });
  const resolvedAccent = (item: TestimonialsTrioItem, i: number) => {
    const wanted = item.accent ?? defaultAccent ?? "auto";
    if (wanted === "auto") return AUTO_CYCLE[i % AUTO_CYCLE.length];
    return wanted;
  };
  return (
    <section
      className="site-testimonials-trio"
      data-variant={variant}
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      {responsiveCss ? (
        <style dangerouslySetInnerHTML={{ __html: responsiveCss }} />
      ) : null}
      <Container width="standard">
        {(eyebrow || headline) && (
          <SectionHead
            align={(headlineNode?.align ?? eyebrowNode?.align) === "left" ? "start" : "center"}
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
        )}
        <div className="site-testimonials-trio__grid">
          {items.map((item, i) => {
            const quote = pickI18n(item.quote, locale);
            const author = pickI18n(item.author, locale);
            const context = pickI18n(item.context, locale);
            const location = pickI18n(item.location, locale);
            return (
            <article
              key={`${author}-${i}`}
              className="site-testimonials-trio__card"
              data-accent={resolvedAccent(item, i)}
            >
              <svg
                aria-hidden
                className="site-testimonials-trio__quote"
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M7 17c-2 0-3-1.2-3-3.2 0-3 2-5.8 5-6.8l.5 1.5c-1.5.5-2.5 2-2.5 3.5H7c1.5 0 2.5 1 2.5 2.5S8.5 17 7 17Z" />
                <path d="M16.5 17c-2 0-3-1.2-3-3.2 0-3 2-5.8 5-6.8l.5 1.5c-1.5.5-2.5 2-2.5 3.5h.5c1.5 0 2.5 1 2.5 2.5s-1 2.5-3 2.5Z" />
              </svg>
              <p className="site-testimonials-trio__text">
                &ldquo;{quote}&rdquo;
              </p>
              {(author || context || location) && (
                <footer className="site-testimonials-trio__meta">
                  {author ? (
                    <strong className="site-testimonials-trio__author">
                      {author}
                    </strong>
                  ) : null}
                  {context || location ? (
                    <span className="site-testimonials-trio__context">
                      {[context, location].filter(Boolean).join(" · ")}
                    </span>
                  ) : null}
                </footer>
              )}
            </article>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
