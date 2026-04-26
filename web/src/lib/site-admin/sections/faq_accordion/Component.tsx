import {
  presentationDataAttrs,
  presentationInlineStyles,
} from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import type { SectionComponentProps } from "../types";
import type { FaqAccordionV1 } from "./schema";

export function FaqAccordionComponent({
  props,
}: SectionComponentProps<FaqAccordionV1>) {
  const {
    eyebrow,
    headline,
    intro,
    items,
    variant,
    defaultOpen,
    presentation,
  } = props;
  return (
    <section
      className="site-faq"
      data-variant={variant}
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      <div className="site-faq__inner">
        {(eyebrow || headline || intro) && (
          <header className="site-faq__head">
            {eyebrow ? <span className="site-eyebrow">{eyebrow}</span> : null}
            {headline ? (
              <h2 className="site-faq__headline">
                {renderInlineRich(headline)}
              </h2>
            ) : null}
            {intro ? <p className="site-faq__intro">{intro}</p> : null}
          </header>
        )}
        <div className="site-faq__list">
          {items.map((item, i) => {
            const open = defaultOpen === i;
            return (
              <details
                key={`${item.question}-${i}`}
                className="site-faq__item"
                open={open}
              >
                <summary className="site-faq__question">
                  <span className="site-faq__q-text">{item.question}</span>
                  <span aria-hidden className="site-faq__chevron">
                    +
                  </span>
                </summary>
                <div className="site-faq__answer">
                  {item.answer.split("\n\n").map((p, k) => (
                    <p key={k}>{renderInlineRich(p)}</p>
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      </div>
    </section>
  );
}
