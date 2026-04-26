import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import type { SectionComponentProps } from "../types";
import type { GalleryStripV1, GalleryStripItem } from "./schema";

function autoAspect(i: number): GalleryStripItem["aspect"] {
  // 4-cycle pattern taken from the prototype: wide / tall / tall / wide
  return ["tall", "wide", "square", "tall"][i % 4] as GalleryStripItem["aspect"];
}

export function GalleryStripComponent({
  props,
}: SectionComponentProps<GalleryStripV1>) {
  const { eyebrow, headline, items, variant, caption, presentation } = props;
  return (
    <section
      className="site-gallery"
      data-variant={variant}
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      <div className="site-gallery__inner">
        {(eyebrow || headline) && (
          <header className="site-gallery__head">
            {eyebrow ? <span className="site-eyebrow">{eyebrow}</span> : null}
            {headline ? (
              <h2 className="site-gallery__headline">
                {renderInlineRich(headline)}
              </h2>
            ) : null}
          </header>
        )}
        <div className="site-gallery__grid">
          {items.map((item, i) => {
            const aspect = item.aspect === "auto" ? autoAspect(i) : item.aspect;
            return (
              <figure
                key={`${item.src}-${i}`}
                className="site-gallery__tile"
                data-aspect={aspect}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.src} alt={item.alt ?? ""} loading="lazy" />
              </figure>
            );
          })}
        </div>
        {caption ? <p className="site-gallery__caption">{caption}</p> : null}
      </div>
    </section>
  );
}
