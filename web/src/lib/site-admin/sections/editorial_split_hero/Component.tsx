import { presentationDataAttrs } from "../shared/presentation";
import { Container, Cta, MediaFrame } from "../shared/section-primitives";
import { prefixPublicHref } from "@/lib/saas/public-hrefs";
import type { SectionComponentProps } from "../types";
import type { EditorialSplitHeroV1 } from "./schema";

export function EditorialSplitHeroComponent({
  props,
  publicPathPrefix = "",
}: SectionComponentProps<EditorialSplitHeroV1>) {
  const {
    eyebrow,
    headline,
    highlight,
    body,
    primaryCta,
    secondaryCta,
    mediaMode,
    mediaUrl,
    mediaAlt,
    mediaRatio,
    mediaStyle,
    mediaStackUrls,
    mediaStackCaptions,
    overlayColor,
    overlayOpacity,
    overlayStrength,
    mediaSide,
    mobileOrder,
    presentation,
  } = props;

  const pfx = (h: string) => prefixPublicHref(h, publicPathPrefix);
  // Only static media renders today; selected/dynamic are documented
  // follow-ons (would couple to the cache-trimmed featured DTO).
  const resolvedMedia = mediaMode === "static" ? (mediaUrl ?? null) : null;
  const stackUrls = (mediaStackUrls ?? []).filter(Boolean).slice(0, 3);
  const useStack = mediaStyle === "card-stack" && stackUrls.length > 0;

  return (
    <section
      className="site-esh"
      data-esh-media-side={mediaSide ?? "right"}
      data-esh-mobile={mobileOrder ?? "text-first"}
      {...presentationDataAttrs(presentation)}
    >
      <Container width="standard">
        <div className="site-esh__grid">
          <div className="site-esh__copy">
            {eyebrow ? (
              <p className="site-esh__eyebrow">{eyebrow}</p>
            ) : null}
            {headline ? (
              <h2 className="site-esh__headline">
                {headline}
                {highlight ? (
                  <span className="site-esh__hl"> {highlight}</span>
                ) : null}
              </h2>
            ) : null}
            {body ? <p className="site-esh__body">{body}</p> : null}
            {primaryCta || secondaryCta ? (
              <div className="site-esh__ctas">
                {primaryCta ? (
                  <Cta
                    href={pfx(primaryCta.href)}
                    variant="primary"
                    size="lg"
                  >
                    {primaryCta.label}
                  </Cta>
                ) : null}
                {secondaryCta ? (
                  <Cta
                    href={pfx(secondaryCta.href)}
                    variant="text"
                    size="lg"
                  >
                    {secondaryCta.label}
                  </Cta>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="site-esh__media" data-esh-media-style={useStack ? "card-stack" : "single"}>
            {useStack ? (
              <div className="site-esh__stack">
                {stackUrls[1] ? (
                  <div className="site-esh__stack-card site-esh__stack-card--b">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={stackUrls[1]} alt="" loading="lazy" decoding="async" />
                  </div>
                ) : null}
                {stackUrls[2] ? (
                  <div className="site-esh__stack-card site-esh__stack-card--c">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={stackUrls[2]} alt="" loading="lazy" decoding="async" />
                  </div>
                ) : null}
                <div className="site-esh__stack-card site-esh__stack-card--main">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={stackUrls[0]}
                    alt={mediaAlt ?? headline ?? ""}
                    loading="lazy"
                    decoding="async"
                  />
                  {mediaStackCaptions?.[0] ? (
                    <div className="site-esh__stack-cap">
                      <b>{mediaStackCaptions[0].name}</b>
                      {mediaStackCaptions[0].sub ? (
                        <span>{mediaStackCaptions[0].sub}</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <MediaFrame
                src={resolvedMedia}
                alt={mediaAlt ?? headline ?? ""}
                ratio={mediaRatio ?? "4/3"}
                overlayColor={overlayColor}
                overlayOpacity={overlayOpacity}
                overlayStrength={overlayStrength ?? "none"}
                fallback={mediaAlt ?? "Media"}
              />
            )}
          </div>
        </div>
      </Container>
    </section>
  );
}
