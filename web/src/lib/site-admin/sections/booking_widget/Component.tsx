import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import type { SectionComponentProps } from "../types";
import type { BookingWidgetV1 } from "./schema";

export function BookingWidgetComponent({ props }: SectionComponentProps<BookingWidgetV1>) {
  const { eyebrow, headline, intro, url, variant, buttonLabel, ratio, minHeight, presentation } = props;
  return (
    <section
      className="site-booking"
      data-variant={variant}
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      <div className="site-booking__inner">
        {(eyebrow || headline || intro) && (
          <header className="site-booking__head">
            {eyebrow ? <span className="site-eyebrow">{eyebrow}</span> : null}
            {headline ? <h2 className="site-booking__headline">{renderInlineRich(headline)}</h2> : null}
            {intro ? <p className="site-booking__intro">{intro}</p> : null}
          </header>
        )}
        {variant === "inline" ? (
          <div
            className="site-booking__frame"
            style={
              minHeight
                ? { minHeight: `${minHeight}px` }
                : { aspectRatio: ratio }
            }
          >
            <iframe
              className="site-booking__iframe"
              src={url}
              title="Booking widget"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
              allow="clipboard-write; payment"
            />
          </div>
        ) : (
          <div className="site-booking__btn-row">
            <a className="site-btn site-btn--primary site-booking__btn" href={url} target="_blank" rel="noopener noreferrer">
              {buttonLabel}
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
