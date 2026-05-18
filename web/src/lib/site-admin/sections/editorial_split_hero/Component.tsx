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
          <div className="site-esh__media">
            <MediaFrame
              src={resolvedMedia}
              alt={mediaAlt ?? headline ?? ""}
              ratio={mediaRatio ?? "4/3"}
              overlayColor={overlayColor}
              overlayOpacity={overlayOpacity}
              overlayStrength={overlayStrength ?? "none"}
              fallback={mediaAlt ?? "Media"}
            />
          </div>
        </div>
      </Container>
    </section>
  );
}
