import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import type { SectionComponentProps } from "../types";
import type { MasonryV1 } from "./schema";

export function MasonryComponent({ props }: SectionComponentProps<MasonryV1>) {
  const { eyebrow, headline, items, columnsDesktop, gap, presentation } = props;
  return (
    <section
      className="site-masonry"
      data-gap={gap}
      style={{
        ["--masonry-cols" as string]: String(columnsDesktop),
        ...presentationInlineStyles(presentation),
      }}
      {...presentationDataAttrs(presentation)}
    >
      <div className="site-masonry__inner">
        {(eyebrow || headline) && (
          <header className="site-masonry__head">
            {eyebrow ? <span className="site-eyebrow">{eyebrow}</span> : null}
            {headline ? (
              <h2 className="site-masonry__headline">{renderInlineRich(headline)}</h2>
            ) : null}
          </header>
        )}
        <div className="site-masonry__cols">
          {items.map((item, i) => {
            const inner = (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.src}
                  alt={item.alt ?? ""}
                  aria-hidden={item.alt ? undefined : true}
                  loading="lazy"
                />
                {item.caption ? (
                  <figcaption className="site-masonry__caption">{item.caption}</figcaption>
                ) : null}
              </>
            );
            return (
              <figure className="site-masonry__item" key={`${item.src}-${i}`}>
                {item.href ? <a href={item.href}>{inner}</a> : inner}
              </figure>
            );
          })}
        </div>
      </div>
    </section>
  );
}
