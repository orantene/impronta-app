import type { CSSProperties } from "react";
import { buildNodePresentationResponsiveCss } from "../shared/node-presentation";
import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import { Container, Cta, SectionHead } from "../shared/section-primitives";
import type { SectionComponentProps } from "../types";
import type { EventListingV1 } from "./schema";

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
        size?: "sm" | "md" | "lg" | "xl" | "display";
        tone?: "default" | "muted" | "strong";
        visibility?: "visible" | "hidden";
      }
    | undefined,
  sizeMapper: (size?: "sm" | "md" | "lg" | "xl" | "display") => CSSProperties["fontSize"],
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

/**
 * Phase E (Batch 2) — Container + SectionHead + Cta. Distinctive
 * interior preserved: the date/time column rhythm, category pill,
 * per-event metadata stack.
 */

export function EventListingComponent({
  props,
  sectionId,
  builderNodeBindings,
}: SectionComponentProps<EventListingV1>) {
  const { eyebrow, headline, events, variant, nodePresentation, presentation } = props;
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
      className="site-events"
      data-variant={variant}
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
          eyebrowBuilderNodeId={nodeIdsByRole?.subheadline}
          headlineBuilderNodeId={nodeIdsByRole?.headline}
        />
        <ol className="site-events__list">
          {events.map((e, i) => (
            <li className="site-events__item" key={`${e.title}-${i}`}>
              <div className="site-events__when">
                <time className="site-events__date">{e.date}</time>
                {e.time ? <span className="site-events__time">{e.time}</span> : null}
              </div>
              <div className="site-events__body">
                {e.category ? <span className="site-events__category">{e.category}</span> : null}
                <h3 className="site-events__title">{e.title}</h3>
                {e.location ? <p className="site-events__location">{e.location}</p> : null}
                {e.description ? <p className="site-events__desc">{e.description}</p> : null}
                {e.rsvpUrl ? (
                  <Cta href={e.rsvpUrl} variant="ghost" className="site-events__rsvp">
                    {e.rsvpLabel || "RSVP"}
                  </Cta>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
