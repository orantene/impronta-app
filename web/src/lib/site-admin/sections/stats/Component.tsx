import {
  presentationDataAttrs,
  presentationInlineStyles,
} from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import { Container, SectionHead } from "../shared/section-primitives";
import type { SectionComponentProps } from "../types";
import type { StatsV1 } from "./schema";

/**
 * Phase E (Batch 1) — uses Container + SectionHead. Distinctive interior:
 * the oversized numerals (the section's visual weight) live in
 * .site-stats__value via the per-section CSS, untouched.
 */
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
      <Container width="standard">
        <SectionHead
          align={align === "center" ? "center" : "start"}
          eyebrow={eyebrow}
          headline={headline ? renderInlineRich(headline) : undefined}
        />
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
      </Container>
    </section>
  );
}
