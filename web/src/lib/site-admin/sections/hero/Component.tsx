import type { SectionComponentProps } from "../types";
import type { HeroV1 } from "./schema";

export function HeroComponent({ props }: SectionComponentProps<HeroV1>) {
  const { headline, subheadline, primaryCta, secondaryCta } = props;
  return (
    <section className="site-hero" data-section-type="hero">
      <h1 className="site-hero__headline">{headline}</h1>
      {subheadline ? (
        <p className="site-hero__subheadline">{subheadline}</p>
      ) : null}
      {(primaryCta || secondaryCta) && (
        <div className="site-hero__ctas">
          {primaryCta ? (
            <a className="site-hero__cta site-hero__cta--primary" href={primaryCta.href}>
              {primaryCta.label}
            </a>
          ) : null}
          {secondaryCta ? (
            <a
              className="site-hero__cta site-hero__cta--secondary"
              href={secondaryCta.href}
            >
              {secondaryCta.label}
            </a>
          ) : null}
        </div>
      )}
    </section>
  );
}
