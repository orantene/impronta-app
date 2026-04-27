import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import { Container, Cta, SectionHead } from "../shared/section-primitives";
import type { SectionComponentProps } from "../types";
import type { PricingGridV1 } from "./schema";

export function PricingGridComponent({ props }: SectionComponentProps<PricingGridV1>) {
  const { eyebrow, headline, intro, plans, variant, presentation } = props;
  return (
    <section
      className="site-pricing"
      data-variant={variant}
      data-cols={plans.length}
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      <Container width="standard">
        {(eyebrow || headline || intro) && (
          <SectionHead
          align="center"
          eyebrow={eyebrow}
          headline={headline ? renderInlineRich(headline) : undefined}
        />
        )}
        <div className="site-pricing__grid">
          {plans.map((plan, i) => (
            <article
              key={`${plan.name}-${i}`}
              className="site-pricing__plan"
              data-highlighted={plan.highlighted ? "true" : "false"}
            >
              {plan.badge ? (
                <span className="site-pricing__badge">{plan.badge}</span>
              ) : null}
              <h3 className="site-pricing__name">{plan.name}</h3>
              <div className="site-pricing__price">
                <span className="site-pricing__amount">{plan.price}</span>
                {plan.cadence ? (
                  <span className="site-pricing__cadence">{plan.cadence}</span>
                ) : null}
              </div>
              {plan.description ? (
                <p className="site-pricing__desc">{plan.description}</p>
              ) : null}
              <ul className="site-pricing__features">
                {plan.features.map((f, k) => (
                  <li key={k}>
                    <span aria-hidden className="site-pricing__bullet">
                      ✓
                    </span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Cta
                href={plan.ctaHref}
                variant={plan.highlighted ? "primary" : "ghost"}
                className="site-pricing__cta"
              >
                {plan.ctaLabel}
              </Cta>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}
