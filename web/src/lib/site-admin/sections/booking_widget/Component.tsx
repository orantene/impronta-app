/**
 * Phase E (Final Batch 3) — head-only migration.
 * SectionHead replaces the bespoke site-booking__head / site-booking__headline
 * pattern, unifying eyebrow + h2 rhythm. The intro paragraph migrates to the
 * SectionHead `intro` slot (site-prim-head__intro). The conditional iframe /
 * button-link layout and frame sizing are preserved exactly.
 */
import { SectionHead } from "../shared/section-primitives";
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
          <SectionHead
            align="center"
            eyebrow={eyebrow}
            headline={headline ? renderInlineRich(headline) : undefined}
            intro={intro}
          />
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
