import type { CSSProperties } from "react";

import type { SectionComponentProps } from "../types";
import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import type { HeroV1, HeroSlide } from "./schema";

/**
 * Server-rendered hero with three progressive rendering modes:
 *
 *   1. Classic (M0 parity) — no `slides`, no imagery. Just headline +
 *      subheadline + CTAs over the site ambient background.
 *   2. Single image — `slides` has one entry OR `backgroundMediaAssetId`
 *      is set. A photographic backdrop with scrim/aurora/vignette overlays.
 *   3. Slider — `slides` has 2+ entries. Pure-CSS cross-fade reel driven
 *      by @keyframes on a per-slide delay; `scroll-snap` fallback for
 *      reduced-motion users and touch gestures.
 *
 * The component stays a React Server Component (no client JS) so the
 * storefront hero remains fully static. Interaction affordances (pause,
 * prev/next) belong in a future client-wrapped variant.
 */
export function HeroComponent({ props }: SectionComponentProps<HeroV1>) {
  const {
    headline,
    subheadline,
    primaryCta,
    secondaryCta,
    backgroundMediaAssetId,
    overlay,
    mood,
    slides,
    autoplayMs,
    presentation,
  } = props;

  const effectiveOverlay = overlay ?? (slides?.length || backgroundMediaAssetId ? "gradient-scrim" : "aurora");
  const effectiveMood = mood ?? "editorial";
  const perSlideMs = Math.max(2000, Math.min(20000, autoplayMs ?? 7000));

  const hasSlides = Array.isArray(slides) && slides.length > 0;
  const isSlider = hasSlides && slides!.length > 1;

  return (
    <section
      className="site-hero"
      data-section-type="hero"
      data-hero-mood={effectiveMood}
      data-hero-overlay={effectiveOverlay}
      data-hero-variant={isSlider ? "slider" : hasSlides ? "image" : "clean"}
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      {hasSlides ? (
        <HeroBackground slides={slides!} perSlideMs={perSlideMs} isSlider={isSlider} />
      ) : null}

      {effectiveOverlay !== "none" ? (
        <div className="site-hero__overlay" aria-hidden />
      ) : null}

      <div className="site-hero__inner">
        <div className="site-hero__copy">
          <h1 className="site-hero__headline">{renderInlineRich(headline)}</h1>
          {subheadline ? (
            <p className="site-hero__subheadline">{renderInlineRich(subheadline)}</p>
          ) : null}
          {(primaryCta || secondaryCta) && (
            <div className="site-hero__ctas">
              {primaryCta ? (
                <a
                  className="site-hero__cta site-hero__cta--primary"
                  href={primaryCta.href}
                >
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
        </div>
      </div>
    </section>
  );
}

function HeroBackground({
  slides,
  perSlideMs,
  isSlider,
}: {
  slides: HeroSlide[];
  perSlideMs: number;
  isSlider: boolean;
}) {
  if (!isSlider) {
    const only = slides[0];
    const bgUrl = only.backgroundImageUrl;
    if (!bgUrl) return null;
    return (
      <div
        className="site-hero__bg site-hero__bg--static"
        style={{ backgroundImage: `url(${JSON.stringify(bgUrl).slice(1, -1)})` }}
        aria-hidden
      />
    );
  }

  const totalMs = perSlideMs * slides.length;
  return (
    <div
      className="site-hero__bg site-hero__bg--slider"
      style={
        {
          "--hero-slider-total": `${totalMs}ms`,
          "--hero-slider-count": slides.length,
        } as CSSProperties
      }
      aria-hidden
    >
      {slides.map((s, i) => {
        if (!s.backgroundImageUrl) return null;
        const delay = i * perSlideMs;
        return (
          <div
            key={i}
            className="site-hero__slide"
            style={
              {
                backgroundImage: `url(${JSON.stringify(s.backgroundImageUrl).slice(1, -1)})`,
                "--hero-slide-delay": `${delay}ms`,
                "--hero-slide-index": i,
              } as CSSProperties
            }
          />
        );
      })}
    </div>
  );
}
