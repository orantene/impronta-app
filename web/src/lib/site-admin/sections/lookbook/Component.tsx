/**
 * Phase E (Final Batch 3) — head-only migration.
 * Container + SectionHead are placed as a sibling to site-lookbook__inner
 * (not inside it). site-lookbook__inner uses width: var(--site-container-max)
 * which is an absolute px value and overflows at mobile widths; Container uses
 * min(--site-container-max, 100%) which clamps to the viewport. This ensures
 * the head is readable at all breakpoints even when the spread grid overflows.
 * The spread-based 2-by-2 page layout and per-page figcaption are preserved.
 */
import type { CSSProperties } from "react";
import { buildNodePresentationResponsiveCss } from "../shared/node-presentation";
import { Container, SectionHead } from "../shared/section-primitives";
import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import type { SectionComponentProps } from "../types";
import type { LookbookV1 } from "./schema";

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

export function LookbookComponent({
  props,
  sectionId,
  builderNodeBindings,
}: SectionComponentProps<LookbookV1>) {
  const { eyebrow, headline, pages, variant, ratio, nodePresentation, presentation } = props;
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
        tablet: textNodeDecls(headlineNode?.breakpoints?.tablet, headingSize),
        mobile: textNodeDecls(headlineNode?.breakpoints?.mobile, headingSize),
      },
    ],
  });
  // Pair pages 2-by-2 for the spread variant; one-up otherwise.
  const pairs: Array<[LookbookV1["pages"][number], LookbookV1["pages"][number] | null]> = [];
  if (variant === "spread") {
    for (let i = 0; i < pages.length; i += 2) {
      pairs.push([pages[i], pages[i + 1] ?? null]);
    }
  } else {
    pages.forEach((p) => pairs.push([p, null]));
  }
  return (
    <section
      className="site-lookbook"
      data-variant={variant}
      data-ratio={ratio}
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      {responsiveCss ? (
        <style dangerouslySetInnerHTML={{ __html: responsiveCss }} />
      ) : null}
      {(eyebrow || headline) && (
        <Container width="standard">
          <SectionHead
            align={headlineNode?.align === "left" ? "start" : "center"}
            eyebrow={
              eyebrow ? (
                <span style={textNodeStyle(eyebrowNode, eyebrowSize)}>
                  {renderInlineRich(eyebrow)}
                </span>
              ) : undefined
            }
            headline={
              headline ? (
                <span style={textNodeStyle(headlineNode, headingSize)}>
                  {renderInlineRich(headline)}
                </span>
              ) : undefined
            }
            eyebrowBuilderNodeId={nodeIdsByRole?.subheadline}
            headlineBuilderNodeId={nodeIdsByRole?.headline}
          />
        </Container>
      )}
      <div className="site-lookbook__inner">
        <div className="site-lookbook__pages">
          {pairs.map((pair, i) => (
            <div className="site-lookbook__spread" key={`spread-${i}`}>
              {pair.map((p, k) => {
                if (!p) return <div key={k} className="site-lookbook__page site-lookbook__page--blank" aria-hidden />;
                return (
                  <figure key={k} className="site-lookbook__page" style={{ aspectRatio: ratio }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.imageUrl} alt={p.alt ?? ""} aria-hidden={p.alt ? undefined : true} loading="lazy" />
                    {p.caption ? <figcaption className="site-lookbook__caption">{p.caption}</figcaption> : null}
                  </figure>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
