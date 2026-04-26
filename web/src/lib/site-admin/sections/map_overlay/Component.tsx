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
        <header className="site-map__head">
          {eyebrow ? <span className="site-eyebrow">{eyebrow}</span> : null}
          {headline ? <h2 className="site-map__headline">{renderInlineRich(headline)}</h2> : null}
        </header>
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
