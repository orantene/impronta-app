import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import type { SectionComponentProps } from "../types";
import type { ImageCopyAlternatingV1 } from "./schema";

export function ImageCopyAlternatingComponent({
  props,
}: SectionComponentProps<ImageCopyAlternatingV1>) {
  const { eyebrow, headline, items, variant, gap, imageRatio, presentation } = props;
  return (
    <section
      className="site-image-copy"
      data-variant={variant}
      data-gap={gap}
      {...presentationDataAttrs(presentation)}
      style={{
        ["--ic-ratio" as string]: imageRatio.replace("/", " / "),
        ...presentationInlineStyles(presentation),
      }}
    >
      <div className="site-image-copy__inner">
        {(eyebrow || headline) && (
          <header className="site-image-copy__head">
            {eyebrow ? <span className="site-eyebrow">{eyebrow}</span> : null}
            {headline ? (
              <h2 className="site-image-copy__headline">
                {renderInlineRich(headline)}
              </h2>
            ) : null}
          </header>
        )}

        <div className="site-image-copy__rows">
          {items.map((item, i) => {
            const imageSide =
              item.side === "image-left"
                ? "left"
                : item.side === "image-right"
                  ? "right"
                  : i % 2 === 0
                    ? "left"
                    : "right";
            return (
              <article
                key={`${item.title}-${i}`}
                className="site-image-copy__row"
                data-image-side={imageSide}
              >
                {item.imageUrl ? (
                  <div className="site-image-copy__media">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.imageUrl}
                      alt={item.imageAlt ?? ""}
                      aria-hidden={item.imageAlt ? undefined : true}
                    />
                  </div>
                ) : (
                  <div className="site-image-copy__media" aria-hidden />
                )}
                <div className="site-image-copy__body">
                  {item.eyebrow ? (
                    <span className="site-eyebrow">{item.eyebrow}</span>
                  ) : null}
                  <h3 className="site-image-copy__title">
                    {renderInlineRich(item.title)}
                  </h3>
                  {item.italicTagline ? (
                    <p className="site-image-copy__tagline">
                      {item.italicTagline}
                    </p>
                  ) : null}
                  {item.body ? (
                    <p className="site-image-copy__body-copy">{item.body}</p>
                  ) : null}
                  {item.listItems && item.listItems.length > 0 ? (
                    <ul className="site-image-copy__list">
                      <li className="site-image-copy__list-eyebrow">Ideal for</li>
                      {item.listItems.map((li, j) => (
                        <li key={j} className="site-image-copy__list-item">
                          <span aria-hidden className="site-image-copy__list-bullet" />
                          {li}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {(item.primaryCta || item.secondaryCta) && (
                    <div className="site-image-copy__ctas">
                      {item.primaryCta ? (
                        <a
                          href={item.primaryCta.href}
                          className="site-btn site-btn--primary"
                        >
                          {item.primaryCta.label}
                        </a>
                      ) : null}
                      {item.secondaryCta ? (
                        <a
                          href={item.secondaryCta.href}
                          className="site-btn site-btn--outline"
                        >
                          {item.secondaryCta.label}
                        </a>
                      ) : null}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
