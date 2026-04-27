import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import { Container, Cta, SectionHead } from "../shared/section-primitives";
import type { SectionComponentProps } from "../types";
import type { EventListingV1 } from "./schema";

/**
 * Phase E (Batch 2) — Container + SectionHead + Cta. Distinctive
 * interior preserved: the date/time column rhythm, category pill,
 * per-event metadata stack.
 */

export function EventListingComponent({ props }: SectionComponentProps<EventListingV1>) {
  const { eyebrow, headline, events, variant, presentation } = props;
  return (
    <section
      className="site-events"
      data-variant={variant}
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      <Container width="standard">
        <SectionHead
          align="center"
          eyebrow={eyebrow}
          headline={headline ? renderInlineRich(headline) : undefined}
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
