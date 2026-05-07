import type { CSSProperties } from "react";
import { buildNodePresentationResponsiveCss } from "../shared/node-presentation";
import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import { SectionHead } from "../shared/section-primitives";
import type { SectionComponentProps } from "../types";
import type { BeforeAfterV1 } from "./schema";

/**
 * Pure-CSS / pure-HTML before/after slider. Uses a native <input type="range">
 * styled to look like a vertical divider handle; the slider's value drives a
 * CSS custom property that controls the clip-path of the "after" image.
 *
 * No JS required — works with prefers-reduced-motion, no hydration cost.
 *
 * Phase E (Batch 3 halfway) — head-only migration. The bespoke `__inner`
 * width (min(960px, 100%)) is INTENTIONALLY preserved (narrower than the
 * standard Container). The frame, range-input, clip-path overlays, labels,
 * and enhancement script all stay bespoke. Only the head typography rhythm
 * is unified.
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

export function BeforeAfterComponent({
  props,
  sectionId,
  builderNodeBindings,
}: SectionComponentProps<BeforeAfterV1>) {
  const {
    eyebrow,
    headline,
    beforeUrl,
    afterUrl,
    beforeAlt,
    afterAlt,
    beforeLabel,
    afterLabel,
    initialPosition,
    ratio,
    nodePresentation,
    presentation,
  } = props;
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
  return (
    <section
      className="site-ba"
      data-ratio={ratio}
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      {responsiveCss ? (
        <style dangerouslySetInnerHTML={{ __html: responsiveCss }} />
      ) : null}
      <div className="site-ba__inner">
        {(eyebrow || headline) && (
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
        )}
        <div
          className="site-ba__frame"
          style={{ ["--ba-pos" as string]: `${initialPosition}%` }}
        >
          {/* Before image fills the frame. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="site-ba__img site-ba__img--before" src={beforeUrl} alt={beforeAlt ?? ""} aria-hidden={beforeAlt ? undefined : true} loading="lazy" />
          {/* After image is clip-pathed to reveal only its right side. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="site-ba__img site-ba__img--after" src={afterUrl} alt={afterAlt ?? ""} aria-hidden={afterAlt ? undefined : true} loading="lazy" />
          <span className="site-ba__label site-ba__label--before" aria-hidden>
            {beforeLabel}
          </span>
          <span className="site-ba__label site-ba__label--after" aria-hidden>
            {afterLabel}
          </span>
          <input
            type="range"
            min={0}
            max={100}
            defaultValue={initialPosition}
            aria-label="Reveal slider"
            className="site-ba__range"
            // Inline onInput keeps the section JS-free at SSR; the input
            // event is wired by the browser to update the local CSS var.
            // We use a tiny attribute-based listener via the data-attr
            // selector below; for true zero-JS we'd need a CSS-only trick
            // (which loses the smooth update). This 6-line script runs
            // only when this section is in the DOM.
            onInput={undefined}
          />
        </div>
      </div>
      {/* tiny enhancement script — wires range value into CSS var */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function(){
              var roots = document.currentScript.parentElement.querySelectorAll('.site-ba__frame');
              roots.forEach(function(root){
                var r = root.querySelector('.site-ba__range');
                if(!r) return;
                r.addEventListener('input', function(){ root.style.setProperty('--ba-pos', r.value + '%'); });
              });
            })();
          `,
        }}
      />
    </section>
  );
}
