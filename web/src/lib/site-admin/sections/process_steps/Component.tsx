import { presentationDataAttrs } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import type { SectionComponentProps } from "../types";
import type { ProcessStepsV1 } from "./schema";

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
    >
      <div className="site-process-steps__inner">
        {(eyebrow || headline || copy) && (
          <header className="site-process-steps__head">
            {eyebrow ? <span className="site-eyebrow">{eyebrow}</span> : null}
            {headline ? (
              <h2 className="site-process-steps__headline">
                {renderInlineRich(headline)}
              </h2>
            ) : null}
            {copy ? <p className="site-process-steps__copy">{copy}</p> : null}
          </header>
        )}
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
      </div>
    </section>
  );
}
