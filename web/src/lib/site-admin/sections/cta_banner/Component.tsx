import { presentationDataAttrs } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import type { SectionComponentProps } from "../types";
import type { CtaBannerV1 } from "./schema";

/**
 * Server-rendered CTA banner. Variant selection happens via a `data-variant`
 * attribute that storefront CSS targets for its layout rules.
 */
export function CtaBannerComponent({ props }: SectionComponentProps<CtaBannerV1>) {
  const {
    eyebrow,
    headline,
    copy,
    reassurance,
    primaryCta,
    secondaryCta,
    backgroundImageUrl,
    overlayOpacity,
    variant,
    imageSide,
    bandTone,
    insetCard,
    presentation,
  } = props;

  const overlayPct = Math.max(0, Math.min(100, overlayOpacity ?? 45));
  const hasBackground =
    variant !== "minimal-band" && Boolean(backgroundImageUrl);

  return (
    <section
      className="site-cta-banner"
      data-variant={variant}
      data-image-side={imageSide}
      data-band-tone={bandTone}
      data-inset-card={insetCard ? "true" : undefined}
      {...presentationDataAttrs(presentation)}
    >
      <div className="site-cta-banner__shell">
        {hasBackground ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="site-cta-banner__image"
              src={backgroundImageUrl}
              alt=""
              aria-hidden
            />
            <span
              className="site-cta-banner__overlay"
              aria-hidden
              style={{
                // Both CSS vars so rules can use whichever matches their variant.
                ["--cta-overlay-opacity" as string]: String(overlayPct / 100),
              }}
            />
          </>
        ) : null}

        <div className="site-cta-banner__inner">
          {eyebrow ? <span className="site-eyebrow">{eyebrow}</span> : null}
          <h2 className="site-cta-banner__headline">
            {renderInlineRich(headline)}
          </h2>
          {copy ? <p className="site-cta-banner__copy">{copy}</p> : null}
          {(primaryCta || secondaryCta) && (
            <div className="site-cta-banner__ctas">
              {primaryCta ? (
                <a
                  href={primaryCta.href}
                  className="site-btn site-btn--primary"
                >
                  {primaryCta.label}
                </a>
              ) : null}
              {secondaryCta ? (
                <a
                  href={secondaryCta.href}
                  className="site-btn site-btn--outline"
                >
                  {secondaryCta.label}
                </a>
              ) : null}
            </div>
          )}
          {reassurance ? (
            <p className="site-cta-banner__reassurance">{reassurance}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
