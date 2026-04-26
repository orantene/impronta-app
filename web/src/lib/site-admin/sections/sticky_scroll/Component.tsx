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
      <div className="site-sticky-scroll__inner">
        {(eyebrow || headline) && (
          <header className="site-sticky-scroll__head">
            {eyebrow ? <span className="site-eyebrow">{eyebrow}</span> : null}
            {headline ? (
              <h2 className="site-sticky-scroll__headline">{renderInlineRich(headline)}</h2>
            ) : null}
          </header>
        )}
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
