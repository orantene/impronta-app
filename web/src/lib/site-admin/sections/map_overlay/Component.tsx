/**
 * Phase E (Final Batch 3) — head-only migration.
 * Container + SectionHead replace the bespoke site-map__head / site-map__headline
 * pattern. Container is required here because the head is a direct child of the
 * section element (no __inner wrapper), and site-map__frame is deliberately
 * full-bleed. The iframe, absolutely-positioned card overlay, and \n\n body
 * splitting are preserved exactly.
 */
import { Container, SectionHead } from "../shared/section-primitives";
import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import type { SectionComponentProps } from "../types";
import type { MapOverlayV1 } from "./schema";

export function MapOverlayComponent({ props }: SectionComponentProps<MapOverlayV1>) {
  const { eyebrow, headline, mapEmbedUrl, card, side, ratio, presentation } = props;
  return (
    <section
      className="site-map"
      data-side={side}
      data-ratio={ratio}
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      {(eyebrow || headline) && (
        <Container width="standard">
          <SectionHead
            align="center"
            eyebrow={eyebrow}
            headline={headline ? renderInlineRich(headline) : undefined}
          />
        </Container>
      )}
      <div className="site-map__frame" style={{ aspectRatio: ratio }}>
        <iframe
          className="site-map__iframe"
          src={mapEmbedUrl}
          title={`${card.title} on map`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          sandbox="allow-scripts allow-same-origin allow-popups"
        />
        <div className="site-map__card">
          <h3 className="site-map__card-title">{card.title}</h3>
          {card.address ? <p className="site-map__address">{card.address}</p> : null}
          {card.hours ? <p className="site-map__hours">{card.hours}</p> : null}
          {card.body ? (
            <div className="site-map__body">
              {card.body.split("\n\n").map((p, k) => (
                <p key={k}>{renderInlineRich(p)}</p>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
