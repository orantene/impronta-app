/**
 * Phase E (Final Batch 3) — partial head alignment.
 *
 * The eyebrow already emits `site-eyebrow` — the same class SectionHead
 * produces — so it is already phase-aligned. The headline is a page-level
 * <h1> (hero semantics) inside the split-grid copy column; migrating it to
 * SectionHead would impose an <h2> and collapse the split-grid layout.
 * No SectionHead import needed: both head tokens are correct by class.
 */
import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import type { SectionComponentProps } from "../types";
import type { HeroSplitV1 } from "./schema";

export function HeroSplitComponent({ props }: SectionComponentProps<HeroSplitV1>) {
  const { eyebrow, headline, subheadline, primaryCta, secondaryCta, imageUrl, imageAlt, side, variant, presentation } = props;
  return (
    <section
      className="site-hero-split"
      data-side={side}
      data-variant={variant}
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      <div className="site-hero-split__inner">
        <div className="site-hero-split__copy">
          {eyebrow ? <span className="site-eyebrow">{eyebrow}</span> : null}
          <h1 className="site-hero-split__headline">{renderInlineRich(headline)}</h1>
          {subheadline ? <p className="site-hero-split__sub">{renderInlineRich(subheadline)}</p> : null}
          {(primaryCta || secondaryCta) && (
            <div className="site-hero-split__ctas">
              {primaryCta ? (
                <a className="site-btn site-btn--primary" href={primaryCta.href}>
                  {primaryCta.label}
                </a>
              ) : null}
              {secondaryCta ? (
                <a className="site-btn site-btn--ghost" href={secondaryCta.href}>
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
