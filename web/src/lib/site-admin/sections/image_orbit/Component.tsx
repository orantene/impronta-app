/**
 * Phase E (Final Batch 3) — head-only migration.
 * SectionHead replaces the bespoke site-orbit__head / site-orbit__headline
 * pattern, unifying eyebrow + h2 rhythm. The absolute-positioned hotspot
 * tags (left: ${tag.x}%, top: ${tag.y}%) and orbit frame are preserved exactly.
 */
import { SectionHead } from "../shared/section-primitives";
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
          <SectionHead
            align="center"
            eyebrow={eyebrow}
            headline={headline ? renderInlineRich(headline) : undefined}
          />
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
