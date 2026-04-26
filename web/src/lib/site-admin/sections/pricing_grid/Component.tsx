import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
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
      <div className="site-pricing__inner">
        {(eyebrow || headline || intro) && (
          <header className="site-pricing__head">
            {eyebrow ? <span className="site-eyebrow">{eyebrow}</span> : null}
            {headline ? (
              <h2 className="site-pricing__headline">{renderInlineRich(headline)}</h2>
            ) : null}
            {intro ? <p className="site-pricing__intro">{intro}</p> : null}
          </header>
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
              <a
                className={
                  plan.highlighted
                    ? "site-btn site-btn--primary site-pricing__cta"
                    : "site-btn site-btn--ghost site-pricing__cta"
                }
                href={plan.ctaHref}
              >
                {plan.ctaLabel}
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
