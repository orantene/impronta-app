import { presentationDataAttrs } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import type { SectionComponentProps } from "../types";
import type { DestinationsMosaicV1 } from "./schema";

export function DestinationsMosaicComponent({
  props,
}: SectionComponentProps<DestinationsMosaicV1>) {
  const { eyebrow, headline, copy, items, footnote, variant, presentation } = props;
  const [hero, ...rest] = items;
  if (!hero) return null;
  return (
    <section
      className="site-destinations-mosaic"
      data-variant={variant}
      {...presentationDataAttrs(presentation)}
    >
      <div className="site-destinations-mosaic__inner">
        {(eyebrow || headline || copy) && (
          <header className="site-destinations-mosaic__head">
            {eyebrow ? <span className="site-eyebrow">{eyebrow}</span> : null}
            {headline ? (
              <h2 className="site-destinations-mosaic__headline">
                {renderInlineRich(headline)}
              </h2>
            ) : null}
            {copy ? <p className="site-destinations-mosaic__copy">{copy}</p> : null}
          </header>
        )}
        <div className="site-destinations-mosaic__grid">
          <Tile item={hero} featured />
          <div className="site-destinations-mosaic__rest">
            {rest.map((d, i) => (
              <Tile key={`${d.label}-${i}`} item={d} />
            ))}
          </div>
        </div>
        {footnote ? (
          <p className="site-destinations-mosaic__footnote">{footnote}</p>
        ) : null}
      </div>
    </section>
  );
}

function Tile({
  item,
  featured,
}: {
  item: DestinationsMosaicV1["items"][number];
  featured?: boolean;
}) {
  const Tag: "a" | "div" = item.href ? "a" : "div";
  return (
    <Tag
      className="site-destinations-mosaic__tile"
      data-featured={featured ? "true" : undefined}
      href={item.href}
    >
      {item.imageUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.imageUrl} alt="" aria-hidden className="site-destinations-mosaic__img" />
          <span className="site-destinations-mosaic__overlay" aria-hidden />
        </>
      ) : null}
      <div className="site-destinations-mosaic__body">
        {item.region ? (
          <span className="site-destinations-mosaic__region">{item.region}</span>
        ) : null}
        <h3 className="site-destinations-mosaic__label">{item.label}</h3>
        {item.tagline ? (
          <p className="site-destinations-mosaic__tagline">{item.tagline}</p>
        ) : null}
      </div>
    </Tag>
  );
}
