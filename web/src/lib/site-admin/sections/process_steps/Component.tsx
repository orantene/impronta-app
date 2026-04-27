import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import { Container, SectionHead } from "../shared/section-primitives";
import type { SectionComponentProps } from "../types";
import type { ProcessStepsV1 } from "./schema";

/**
 * Phase E (Batch 2) — Container + SectionHead. Distinctive interior:
 * the numbered-step rhythm (Arabic / Roman / none), per-step card
 * layout, and number-style data-attr-driven styling stay.
 */

function formatNumber(i: number, style: ProcessStepsV1["numberStyle"]): string {
  const n = i + 1;
  if (style === "roman") {
    const roman = ["I", "II", "III", "IV", "V", "VI"];
    return roman[i] ?? String(n);
  }
  return String(n).padStart(2, "0");
}

export function ProcessStepsComponent({
  props,
}: SectionComponentProps<ProcessStepsV1>) {
  const { eyebrow, headline, copy, steps, variant, numberStyle, presentation } =
    props;
  return (
    <section
      className="site-process-steps"
      data-variant={variant}
      data-number-style={numberStyle}
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      <Container width="standard">
        <SectionHead
          align="center"
          eyebrow={eyebrow}
          headline={headline ? renderInlineRich(headline) : undefined}
          intro={copy}
        />
        <div className="site-process-steps__grid">
          {steps.map((step, i) => (
            <article
              key={`${step.label}-${i}`}
              className="site-process-steps__card"
            >
              {numberStyle !== "none" ? (
                <span className="site-process-steps__numeral" aria-hidden>
                  {formatNumber(i, numberStyle)}
                </span>
              ) : null}
              <span aria-hidden className="site-process-steps__rule" />
              <h3 className="site-process-steps__label">{step.label}</h3>
              {step.detail ? (
                <p className="site-process-steps__detail">{step.detail}</p>
              ) : null}
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}
