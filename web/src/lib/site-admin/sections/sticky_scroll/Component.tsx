/**
 * Phase E (Final Batch 3) — head-only migration.
 * Container + SectionHead are placed as a sibling to site-sticky-scroll__inner
 * (not inside it) to ensure viewport-clamped head at mobile. The sticky image
 * column, scrollable block articles, and \n\n body splitting are preserved.
 */
import { Container, SectionHead } from "../shared/section-primitives";
import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import type { SectionComponentProps } from "../types";
import type { StickyScrollV1 } from "./schema";

export function StickyScrollComponent({ props }: SectionComponentProps<StickyScrollV1>) {
  const { eyebrow, headline, imageUrl, imageAlt, blocks, side, variant, presentation } = props;
  return (
    <section
      className="site-sticky-scroll"
      data-side={side}
      data-variant={variant}
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      {(eyebrow || headline) && (
        <Container width="standard">
          <SectionHead
            align="center"
            eyebrow={eyebrow}
            headline={headline ? renderInlineRich(headline) : undefined}
          />
        </Container>
      )}
      <div className="site-sticky-scroll__inner">
        <div className="site-sticky-scroll__grid">
          <div className="site-sticky-scroll__media">
            <div className="site-sticky-scroll__media-frame">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt={imageAlt ?? ""}
                aria-hidden={imageAlt ? undefined : true}
                loading="lazy"
              />
            </div>
          </div>
          <div className="site-sticky-scroll__blocks">
            {blocks.map((b, i) => (
              <article className="site-sticky-scroll__block" key={`${b.title}-${i}`}>
                <h3 className="site-sticky-scroll__block-title">{b.title}</h3>
                <div className="site-sticky-scroll__block-body">
                  {b.body.split("\n\n").map((p, k) => (
                    <p key={k}>{renderInlineRich(p)}</p>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
