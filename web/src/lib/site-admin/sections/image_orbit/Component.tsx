import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import type { SectionComponentProps } from "../types";
import type { ImageOrbitV1 } from "./schema";

export function ImageOrbitComponent({ props }: SectionComponentProps<ImageOrbitV1>) {
  const { eyebrow, headline, imageUrl, imageAlt, tags, ratio, presentation } = props;
  return (
    <section
      className="site-orbit"
      data-ratio={ratio}
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      <div className="site-orbit__inner">
        {(eyebrow || headline) && (
          <header className="site-orbit__head">
            {eyebrow ? <span className="site-eyebrow">{eyebrow}</span> : null}
            {headline ? <h2 className="site-orbit__headline">{renderInlineRich(headline)}</h2> : null}
          </header>
        )}
        <div className="site-orbit__frame" style={{ aspectRatio: ratio }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="site-orbit__img" src={imageUrl} alt={imageAlt ?? ""} aria-hidden={imageAlt ? undefined : true} loading="lazy" />
          {tags.map((tag, i) => (
            <div
              key={`${tag.label}-${i}`}
              className="site-orbit__tag"
              style={{ left: `${tag.x}%`, top: `${tag.y}%` }}
            >
              <span className="site-orbit__pin" aria-hidden>
                {i + 1}
              </span>
              <div className="site-orbit__bubble">
                <strong>{tag.label}</strong>
                {tag.detail ? <span>{tag.detail}</span> : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
