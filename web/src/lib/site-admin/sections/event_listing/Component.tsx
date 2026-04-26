import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import type { SectionComponentProps } from "../types";
import type { EventListingV1 } from "./schema";

export function EventListingComponent({ props }: SectionComponentProps<EventListingV1>) {
  const { eyebrow, headline, events, variant, presentation } = props;
  return (
    <section
      className="site-events"
      data-variant={variant}
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      <div className="site-events__inner">
        {(eyebrow || headline) && (
          <header className="site-events__head">
            {eyebrow ? <span className="site-eyebrow">{eyebrow}</span> : null}
            {headline ? <h2 className="site-events__headline">{renderInlineRich(headline)}</h2> : null}
          </header>
        )}
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
                  <a className="site-btn site-btn--ghost site-events__rsvp" href={e.rsvpUrl}>
                    {e.rsvpLabel || "RSVP"}
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
