import type { CSSProperties } from "react";
import { buildNodePresentationResponsiveCss } from "../shared/node-presentation";
import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import { Container, SectionHead } from "../shared/section-primitives";
import type { SectionComponentProps } from "../types";
import type { DonationFormV1 } from "./schema";

/**
 * Phase E (Batch 2) — Container + SectionHead. Submit button stays as
 * `<button>` (form submit, not navigational), so the Cta primitive
 * doesn't apply here.
 */

const FMT: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  AUD: "A$",
  CAD: "C$",
  MXN: "MX$",
};

function textAlignFor(align?: "left" | "center" | "right"): CSSProperties["textAlign"] {
  if (align === "left") return "left";
  if (align === "right") return "right";
  if (align === "center") return "center";
  return undefined;
}

function textToneColor(tone?: "default" | "muted" | "strong"): CSSProperties["color"] {
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

function ctaSize(size?: "sm" | "md" | "lg" | "xl"): Pick<CSSProperties, "padding" | "fontSize"> {
  if (size === "sm") return { padding: "0.64rem 1.14rem", fontSize: "0.84rem" };
  if (size === "lg") return { padding: "0.95rem 1.8rem", fontSize: "1rem" };
  if (size === "xl") return { padding: "1.06rem 2rem", fontSize: "1.03rem" };
  return {};
}

function visibilityDisplay(visibility?: "visible" | "hidden"): CSSProperties["display"] {
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
  if (style.alignSelf) decls.push(`align-self:${style.alignSelf}`);
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
    marginRight: typeof node?.marginRightPx === "number" ? `${node.marginRightPx}px` : undefined,
    paddingTop: typeof node?.paddingTopPx === "number" ? `${node.paddingTopPx}px` : undefined,
    paddingBottom:
      typeof node?.paddingBottomPx === "number" ? `${node.paddingBottomPx}px` : undefined,
    paddingInline:
      typeof node?.paddingLeftPx !== "number" &&
      typeof node?.paddingRightPx !== "number" &&
      typeof node?.paddingInlinePx === "number"
        ? `${node.paddingInlinePx}px`
        : undefined,
    paddingLeft: typeof node?.paddingLeftPx === "number" ? `${node.paddingLeftPx}px` : undefined,
    paddingRight:
      typeof node?.paddingRightPx === "number" ? `${node.paddingRightPx}px` : undefined,
    fontSize: sizeMapper(node?.size),
    color: textToneColor(node?.tone),
  };
}

function ctaNodeStyle(
  node:
    | {
        align?: "left" | "center" | "right";
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
  const alignSelf =
    node?.align === "left"
      ? "flex-start"
      : node?.align === "right"
        ? "flex-end"
        : node?.align === "center"
          ? "center"
          : undefined;
  return {
    ...ctaSize(node?.size),
    alignSelf,
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
    marginRight: typeof node?.marginRightPx === "number" ? `${node.marginRightPx}px` : undefined,
    paddingTop: typeof node?.paddingTopPx === "number" ? `${node.paddingTopPx}px` : undefined,
    paddingBottom:
      typeof node?.paddingBottomPx === "number" ? `${node.paddingBottomPx}px` : undefined,
    paddingInline:
      typeof node?.paddingLeftPx !== "number" &&
      typeof node?.paddingRightPx !== "number" &&
      typeof node?.paddingInlinePx === "number"
        ? `${node.paddingInlinePx}px`
        : undefined,
    paddingLeft: typeof node?.paddingLeftPx === "number" ? `${node.paddingLeftPx}px` : undefined,
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
        align?: "left" | "center" | "right";
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

function sectionHeadAlignDecls(align?: "left" | "center" | "right"): string[] {
  if (align === "left") return ["text-align:left", "align-items:flex-start", "margin-inline:0"];
  if (align === "right") return ["text-align:right", "align-items:flex-end", "margin-inline:0"];
  if (align === "center") return ["text-align:center", "align-items:center", "margin-inline:auto"];
  return [];
}

export function DonationFormComponent({
  props,
  sectionId,
  builderNodeBindings,
}: SectionComponentProps<DonationFormV1>) {
  const {
    eyebrow,
    headline,
    intro,
    amounts,
    currency,
    defaultAmountIndex,
    allowCustom,
    checkoutUrl,
    ctaLabel,
    trustNote,
    nodePresentation,
    presentation,
  } = props;
  const symbol = FMT[currency] ?? `${currency} `;
  const nodeIdsByRole = builderNodeBindings?.nodeIdsByRole;
  const eyebrowNode = nodePresentation?.subheadline;
  const headlineNode = nodePresentation?.headline;
  const copyNode = nodePresentation?.copy;
  const primaryCtaNode = nodePresentation?.primaryCta;
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
      {
        selector: ".site-donate__submit",
        tablet: ctaDecls(primaryCtaNode?.breakpoints?.tablet),
        mobile: ctaDecls(primaryCtaNode?.breakpoints?.mobile),
      },
    ],
  });

  return (
    <section
      className="site-donate"
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      {responsiveCss ? <style dangerouslySetInnerHTML={{ __html: responsiveCss }} /> : null}
      <Container width="standard">
        <SectionHead
          align={(headlineNode?.align ?? eyebrowNode?.align) === "left" ? "start" : "center"}
          eyebrow={
            eyebrow ? (
              <span style={textNodeStyle(eyebrowNode, eyebrowSize)}>{renderInlineRich(eyebrow)}</span>
            ) : undefined
          }
          headline={
            headline ? (
              <span style={textNodeStyle(headlineNode, headingSize)}>{renderInlineRich(headline)}</span>
            ) : undefined
          }
          intro={
            intro ? (
              <span style={textNodeStyle(copyNode, paragraphSize)}>{renderInlineRich(intro)}</span>
            ) : undefined
          }
          eyebrowBuilderNodeId={nodeIdsByRole?.subheadline}
          headlineBuilderNodeId={nodeIdsByRole?.headline}
          introBuilderNodeId={nodeIdsByRole?.copy}
        />
        <form className="site-donate__form" action={checkoutUrl} method="GET">
          <div className="site-donate__chips" role="radiogroup" aria-label="Donation amount">
            {amounts.map((amt, i) => (
              <label key={`amt-${i}`} className="site-donate__chip">
                <input
                  type="radio"
                  name="amount"
                  value={String(amt)}
                  defaultChecked={i === defaultAmountIndex}
                />
                <span>
                  {symbol}
                  {amt.toLocaleString()}
                </span>
              </label>
            ))}
          </div>
          {allowCustom ? (
            <div className="site-donate__custom">
              <label htmlFor="donate-custom" className="site-donate__custom-label">
                Or enter a custom amount
              </label>
              <div className="site-donate__custom-input">
                <span aria-hidden>{symbol}</span>
                <input id="donate-custom" type="number" name="custom_amount" min="1" step="1" placeholder="0" />
              </div>
            </div>
          ) : null}
          <button
            type="submit"
            className="site-btn site-btn--primary site-donate__submit"
            data-builder-node-id={nodeIdsByRole?.primaryCta}
            style={ctaNodeStyle(primaryCtaNode)}
          >
            {ctaLabel}
          </button>
          {trustNote ? <p className="site-donate__trust">{trustNote}</p> : null}
        </form>
      </Container>
    </section>
  );
}
