import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import { Container, SectionHead } from "../shared/section-primitives";
import type { SectionComponentProps } from "../types";
import type { ScrollCarouselV1 } from "./schema";

/**
 * Phase E (Batch 3 halfway) — head-only migration. The horizontal
 * scroll-snap track is INTENTIONALLY a sibling of the Container, not a
 * child — it must remain full-bleed across the viewport so the carousel
 * extends past the standard container's max-width. vw-relative card widths
 * and scroll-snap behavior stay bespoke.
 */
export function ScrollCarouselComponent({ props }: SectionComponentProps<ScrollCarouselV1>) {
  const { eyebrow, headline, slides, cardWidthVw, showProgress, presentation } = props;
  return (
    <section
      className="site-carousel"
      data-show-progress={showProgress ? "true" : "false"}
      style={{
        ["--carousel-card-w" as string]: `${cardWidthVw}vw`,
        ...presentationInlineStyles(presentation),
      }}
      {...presentationDataAttrs(presentation)}
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
      <div className="site-carousel__track">
        {slides.map((slide, i) => {
          const inner = (
            <>
              {slide.imageUrl ? (
                <div className="site-carousel__media">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={slide.imageUrl}
                    alt={slide.imageAlt ?? ""}
                    aria-hidden={slide.imageAlt ? undefined : true}
                    loading="lazy"
                  />
                </div>
              ) : null}
              {(slide.title || slide.caption) && (
                <div className="site-carousel__copy">
                  {slide.title ? <h3 className="site-carousel__title">{slide.title}</h3> : null}
                  {slide.caption ? <p className="site-carousel__caption">{slide.caption}</p> : null}
                </div>
              )}
            </>
          );
          return (
            <article className="site-carousel__card" key={`s-${i}`}>
              {slide.href ? <a href={slide.href}>{inner}</a> : inner}
            </article>
          );
        })}
      </div>
    </section>
  );
}
