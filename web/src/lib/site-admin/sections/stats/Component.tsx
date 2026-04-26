import {
  presentationDataAttrs,
  presentationInlineStyles,
} from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import type { SectionComponentProps } from "../types";
import type { StatsV1 } from "./schema";

export function StatsComponent({ props }: SectionComponentProps<StatsV1>) {
  const { eyebrow, headline, items, variant, align, presentation } = props;
  return (
    <section
      className="site-stats"
      data-variant={variant}
      data-align={align}
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      <div className="site-stats__inner">
        {(eyebrow || headline) && (
          <header className="site-stats__head">
            {eyebrow ? <span className="site-eyebrow">{eyebrow}</span> : null}
            {headline ? (
              <h2 className="site-stats__headline">
                {renderInlineRich(headline)}
              </h2>
            ) : null}
          </header>
        )}
        <dl className="site-stats__grid">
          {items.map((item, i) => (
            <div className="site-stats__item" key={`${item.label}-${i}`}>
              <dt className="site-stats__value">{item.value}</dt>
              <dd className="site-stats__label">{item.label}</dd>
              {item.caption ? (
                <p className="site-stats__caption">{item.caption}</p>
              ) : null}
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
