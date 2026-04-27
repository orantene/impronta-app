import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import { Container, SectionHead } from "../shared/section-primitives";
import type { SectionComponentProps } from "../types";
import type { TimelineV1 } from "./schema";

export function TimelineComponent({ props }: SectionComponentProps<TimelineV1>) {
  const { eyebrow, headline, items, variant, numberStyle, presentation } = props;
  return (
    <section
      className="site-timeline"
      data-variant={variant}
      data-number-style={numberStyle}
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      <Container width="standard">
        {(eyebrow || headline) && (
          <SectionHead
          align="center"
          eyebrow={eyebrow}
          headline={headline ? renderInlineRich(headline) : undefined}
        />
        )}
        <ol className="site-timeline__list">
          {items.map((item, i) => (
            <li className="site-timeline__item" key={`${item.date}-${i}`}>
              <div className="site-timeline__marker" aria-hidden>
                {numberStyle === "year" ? <span>{item.date}</span> : null}
              </div>
              <div className="site-timeline__body">
                <span className="site-timeline__date">{item.date}</span>
                <h3 className="site-timeline__title">{item.title}</h3>
                {item.body ? (
                  <div className="site-timeline__detail">
                    {item.body.split("\n\n").map((p, k) => (
                      <p key={k}>{renderInlineRich(p)}</p>
                    ))}
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
