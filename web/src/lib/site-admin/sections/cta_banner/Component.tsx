import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import { Cta } from "../shared/section-primitives";
import type { SectionComponentProps } from "../types";
import type { CtaBannerV1 } from "./schema";

/**
 * Server-rendered CTA banner. Variant selection happens via a `data-variant`
 * attribute that storefront CSS targets for its layout rules.
 *
 * Phase E (Batch 2) — adopts the shared `Cta` primitive for primary +
 * secondary buttons. Section-internal layout (`__shell` / `__inner` and
 * variant-specific positioning rules) is intentionally preserved — the
 * three variants (centered-overlay / split-image / minimal-band) all
 * depend on the `__inner` element being the positioning context, plus
 * the `__headline` carries a deliberately large clamp(34px, 5.2vw, 68px)
 * that's distinctive to this section's editorial conversion tone. Only
 * the CTA shape unifies.
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
    backgroundImageAlt,
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
      style={presentationInlineStyles(presentation)}
    >
      <div className="site-cta-banner__shell">
        {hasBackground ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="site-cta-banner__image"
              src={backgroundImageUrl}
              alt={backgroundImageAlt ?? ""}
              aria-hidden={backgroundImageAlt ? undefined : true}
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
            <div className="site-prim-ctas site-cta-banner__ctas">
              {primaryCta ? (
                <Cta href={primaryCta.href} variant="primary">
                  {primaryCta.label}
                </Cta>
              ) : null}
              {secondaryCta ? (
                <Cta href={secondaryCta.href} variant="secondary">
                  {secondaryCta.label}
                </Cta>
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
