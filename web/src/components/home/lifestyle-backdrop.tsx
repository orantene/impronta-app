import type { CSSProperties } from "react";

/**
 * Full-bleed lifestyle image reel that sits behind the fallback hero search
 * when no CMS-authored hero slot is published. Pure CSS fade/crossfade via
 * `site-hero__slide` keyframes — no client JS.
 *
 * Renders via remote Unsplash URLs (img-src `https:` is allowlisted on the
 * app CSP). When the M5 hero editor lands, tenants publish their own hero
 * section with `slides[]` and this backdrop is bypassed entirely.
 */
export interface LifestyleBackdropProps {
  /** Ordered list of absolute image URLs. Up to 8 entries recommended. */
  slides: string[];
  /** Per-slide display duration in ms. Defaults to 7000. */
  perSlideMs?: number;
  /** Overlay flavor. Defaults to "gradient-scrim". */
  overlay?: "none" | "gradient-scrim" | "aurora" | "soft-vignette";
}

export function LifestyleBackdrop({
  slides,
  perSlideMs = 7000,
  overlay = "gradient-scrim",
}: LifestyleBackdropProps) {
  const clean = slides.filter((u) => typeof u === "string" && u.length > 0);
  if (clean.length === 0) return null;
  const totalMs = Math.max(2000, Math.min(20000, perSlideMs)) * clean.length;
  const isSlider = clean.length > 1;

  return (
    <>
      <div
        aria-hidden
        className={isSlider ? "site-hero__bg site-hero__bg--slider" : "site-hero__bg site-hero__bg--static"}
        style={
          isSlider
            ? ({
                "--hero-slider-total": `${totalMs}ms`,
                "--hero-slider-count": clean.length,
              } as CSSProperties)
            : { backgroundImage: `url(${JSON.stringify(clean[0]).slice(1, -1)})` }
        }
      >
        {isSlider
          ? clean.map((url, i) => (
              <div
                key={i}
                className="site-hero__slide"
                style={
                  {
                    backgroundImage: `url(${JSON.stringify(url).slice(1, -1)})`,
                    "--hero-slide-delay": `${i * perSlideMs}ms`,
                  } as CSSProperties
                }
              />
            ))
          : null}
      </div>
      {overlay !== "none" ? (
        <div
          aria-hidden
          className="site-hero__overlay"
          data-hero-overlay={overlay}
        />
      ) : null}
    </>
  );
}
