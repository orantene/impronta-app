import {
  presentationDataAttrs,
  presentationInlineStyles,
} from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import { Container, SectionHead } from "../shared/section-primitives";
import type { SectionComponentProps } from "../types";
import type { FaqAccordionV1 } from "./schema";

/**
 * Phase E (Batch 2) — Container + SectionHead. Distinctive interior:
 * `<details>`-driven accordion with chevron rotation animation stays.
 */

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
      <Container width="standard">
        <SectionHead
          align="center"
          eyebrow={eyebrow}
          headline={headline ? renderInlineRich(headline) : undefined}
          intro={intro}
        />
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
      </Container>
    </section>
  );
}
