import {
  presentationDataAttrs,
  presentationInlineStyles,
} from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import { Cta } from "../shared/section-primitives";
import type { SectionComponentProps } from "../types";
import type { SplitScreenV1 } from "./schema";

/**
 * Phase E (Batch 2) — split_screen's `__inner` is a 2-column flex
 * wrapper for `__media` + `__copy`, not a generic content container,
 * so it intentionally does NOT use the standard Container primitive.
 * Only the CTAs adopt the shared Cta primitive — the variant-driven
 * column layout (50/50, 40/60, 60/40, edge-to-edge), sticky media,
 * and side-flip mechanics are the section's signature and stay.
 */

export function SplitScreenComponent({
  props,
}: SectionComponentProps<SplitScreenV1>) {
  const {
    eyebrow,
    headline,
    body,
    primaryCta,
    secondaryCta,
    imageUrl,
    imageAlt,
    videoUrl,
    side,
    variant,
    verticalAlign,
    stickyMedia,
    presentation,
  } = props;

  const Media = videoUrl ? (
    <video
      className="site-split__media-el"
      src={videoUrl}
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
    />
  ) : imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="site-split__media-el"
      src={imageUrl}
      alt={imageAlt ?? ""}
      loading="lazy"
    />
  ) : null;

  return (
    <section
      className="site-split"
      data-side={side}
      data-variant={variant}
      data-valign={verticalAlign}
      data-sticky={stickyMedia ? "true" : "false"}
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      <div className="site-split__inner">
        <div className="site-split__media">
          <div
            className={
              stickyMedia ? "site-split__media-stick" : "site-split__media-frame"
            }
          >
            {Media}
          </div>
        </div>
        <div className="site-split__copy">
          {eyebrow ? <span className="site-eyebrow">{eyebrow}</span> : null}
          <h2 className="site-split__headline">{renderInlineRich(headline)}</h2>
          {body ? (
            <div className="site-split__body">
              {body.split("\n\n").map((p, i) => (
                <p key={i}>{renderInlineRich(p)}</p>
              ))}
            </div>
          ) : null}
          {(primaryCta || secondaryCta) && (
            <div className="site-prim-ctas site-split__ctas">
              {primaryCta ? (
                <Cta href={primaryCta.href} variant="primary">
                  {primaryCta.label}
                </Cta>
              ) : null}
              {secondaryCta ? (
                <Cta href={secondaryCta.href} variant="ghost">
                  {secondaryCta.label}
                </Cta>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
