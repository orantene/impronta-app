/**
 * Phase E (Final Batch 3) — head-only migration.
 * Container + SectionHead are placed as a sibling to site-orbit__inner (not
 * inside it). site-orbit__inner uses an absolute-px width that overflows at
 * mobile; Container clamps with min(..., 100%) ensuring the head is visible at
 * all breakpoints. The absolute-positioned hotspot tags (left: ${tag.x}%,
 * top: ${tag.y}%) and orbit frame are preserved exactly.
 */
import { Container, SectionHead } from "../shared/section-primitives";
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
      {(eyebrow || headline) && (
        <Container width="standard">
          <SectionHead
            align="center"
            eyebrow={eyebrow}
            headline={headline ? renderInlineRich(headline) : undefined}
          />
        </Container>
      )}
      <div className="site-orbit__inner">
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
