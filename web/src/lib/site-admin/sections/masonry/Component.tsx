import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import { Container, SectionHead } from "../shared/section-primitives";
import type { SectionComponentProps } from "../types";
import type { MasonryV1 } from "./schema";

/**
 * Phase E (Batch 3 halfway) — head-only migration. The CSS-columns masonry
 * (column-count, variable-height tiles, caption typography) stays bespoke.
 * Only eyebrow + headline rhythm is unified.
 */
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
      <Container width="standard">
        {(eyebrow || headline) && (
          <SectionHead
            align="center"
            eyebrow={eyebrow}
            headline={headline ? renderInlineRich(headline) : undefined}
          />
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
      </Container>
    </section>
  );
}
