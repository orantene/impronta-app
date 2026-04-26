import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import type { SectionComponentProps } from "../types";
import type { ScrollCarouselV1 } from "./schema";

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
      <div className="site-carousel__inner">
        {(eyebrow || headline) && (
          <header className="site-carousel__head">
            {eyebrow ? <span className="site-eyebrow">{eyebrow}</span> : null}
            {headline ? (
              <h2 className="site-carousel__headline">{renderInlineRich(headline)}</h2>
            ) : null}
          </header>
        )}
      </div>
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
