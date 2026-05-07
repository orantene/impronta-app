import type { CSSProperties } from "react";
import { buildNodePresentationResponsiveCss } from "../shared/node-presentation";
import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import { Container, SectionHead } from "../shared/section-primitives";
import type { SectionComponentProps } from "../types";
import type { MagazineLayoutV1, MagazineCard } from "./schema";

/**
 * Phase E (Batch 3 halfway) — head-only migration. The 1-hero +
 * N-secondary asymmetric grid, the hero card's larger title scale, the
 * per-card category labels, and h3/h4 hierarchy by role all stay bespoke.
 */

function CardCell({ card, isHero }: { card: MagazineCard; isHero?: boolean }) {
  const inner = (
    <>
      {card.imageUrl ? (
        <div className="site-mag__media">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={card.imageUrl}
            alt={card.imageAlt ?? ""}
            aria-hidden={card.imageAlt ? undefined : true}
            loading="lazy"
          />
        </div>
      ) : null}
      <div className="site-mag__copy">
        {card.category ? <span className="site-mag__category">{card.category}</span> : null}
        {isHero ? (
          <h3 className="site-mag__title site-mag__title--hero">{card.title}</h3>
        ) : (
          <h4 className="site-mag__title">{card.title}</h4>
        )}
        {card.excerpt ? <p className="site-mag__excerpt">{card.excerpt}</p> : null}
      </div>
    </>
  );
  return (
    <article className={isHero ? "site-mag__card site-mag__card--hero" : "site-mag__card"}>
      {card.href ? <a href={card.href}>{inner}</a> : inner}
    </article>
  );
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

function textNodeStyle(
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
): CSSProperties {
  return {
    display: visibilityDisplay(node?.visibility) ?? "inline-block",
    textAlign: textAlignFor(node?.align),
    maxWidth: node?.maxWidthPx ? `${node.maxWidthPx}px` : undefined,
    fontSize: sizeMapper(node?.size),
    color: textToneColor(node?.tone),
  };
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

export function MagazineLayoutComponent({
  props,
  sectionId,
  builderNodeBindings,
}: SectionComponentProps<MagazineLayoutV1>) {
  const { eyebrow, headline, hero, secondary, nodePresentation, presentation } = props;
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
      className="site-mag"
      data-secondary-count={String(secondary.length)}
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      {responsiveCss ? (
        <style dangerouslySetInnerHTML={{ __html: responsiveCss }} />
      ) : null}
      <Container width="standard">
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
        <div className="site-mag__grid">
          <CardCell card={hero} isHero />
          {secondary.map((c, i) => (
            <CardCell key={`${c.title}-${i}`} card={c} />
          ))}
        </div>
      </Container>
    </section>
  );
}
