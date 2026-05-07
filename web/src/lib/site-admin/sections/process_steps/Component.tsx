import type { CSSProperties } from "react";
import { buildNodePresentationResponsiveCss } from "../shared/node-presentation";
import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import { Container, SectionHead } from "../shared/section-primitives";
import type { SectionComponentProps } from "../types";
import type { ProcessStepsV1 } from "./schema";

/**
 * Phase E (Batch 2) — Container + SectionHead. Distinctive interior:
 * the numbered-step rhythm (Arabic / Roman / none), per-step card
 * layout, and number-style data-attr-driven styling stay.
 */

function formatNumber(i: number, style: ProcessStepsV1["numberStyle"]): string {
  const n = i + 1;
  if (style === "roman") {
    const roman = ["I", "II", "III", "IV", "V", "VI"];
    return roman[i] ?? String(n);
  }
  return String(n).padStart(2, "0");
}

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
        size?: "sm" | "md" | "lg" | "xl";
        tone?: "default" | "muted" | "strong";
        visibility?: "visible" | "hidden";
      }
    | undefined,
  sizeMapper: (size?: "sm" | "md" | "lg" | "xl") => CSSProperties["fontSize"],
): string[] {
  if (!node) return [];
  return toCssDecls({
    textAlign: textAlignFor(node.align),
    maxWidth: node.maxWidthPx ? `${node.maxWidthPx}px` : undefined,
    fontSize: sizeMapper(node.size),
    color: textToneColor(node.tone),
    display: node.visibility === "visible" ? "revert" : visibilityDisplay(node.visibility),
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

export function ProcessStepsComponent({
  props,
  sectionId,
  builderNodeBindings,
}: SectionComponentProps<ProcessStepsV1>) {
  const { eyebrow, headline, copy, steps, variant, numberStyle, nodePresentation, presentation } =
    props;
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
      className="site-process-steps"
      data-variant={variant}
      data-number-style={numberStyle}
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
                  maxWidth: eyebrowNode?.maxWidthPx ? `${eyebrowNode.maxWidthPx}px` : undefined,
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
                  maxWidth: headlineNode?.maxWidthPx ? `${headlineNode.maxWidthPx}px` : undefined,
                  fontSize: headingSize(headlineNode?.size),
                  color: textToneColor(headlineNode?.tone),
                }}
              >
                {renderInlineRich(headline)}
              </span>
            ) : undefined
          }
          intro={
            copy ? (
              <span
                style={{
                  display: visibilityDisplay(copyNode?.visibility) ?? "inline-block",
                  textAlign: textAlignFor(copyNode?.align),
                  maxWidth: copyNode?.maxWidthPx ? `${copyNode.maxWidthPx}px` : undefined,
                  fontSize: paragraphSize(copyNode?.size),
                  color: textToneColor(copyNode?.tone),
                }}
              >
                {renderInlineRich(copy)}
              </span>
            ) : undefined
          }
          eyebrowBuilderNodeId={nodeIdsByRole?.subheadline}
          headlineBuilderNodeId={nodeIdsByRole?.headline}
          introBuilderNodeId={nodeIdsByRole?.copy}
        />
        <div className="site-process-steps__grid">
          {steps.map((step, i) => (
            <article
              key={`${step.label}-${i}`}
              className="site-process-steps__card"
            >
              {numberStyle !== "none" ? (
                <span className="site-process-steps__numeral" aria-hidden>
                  {formatNumber(i, numberStyle)}
                </span>
              ) : null}
              <span aria-hidden className="site-process-steps__rule" />
              <h3 className="site-process-steps__label">{step.label}</h3>
              {step.detail ? (
                <p className="site-process-steps__detail">{step.detail}</p>
              ) : null}
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}
