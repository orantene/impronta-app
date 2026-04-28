/**
 * Phase E (Final Batch 3) — head-only migration.
 * Container + SectionHead are placed as a sibling to site-lookbook__inner
 * (not inside it). site-lookbook__inner uses width: var(--site-container-max)
 * which is an absolute px value and overflows at mobile widths; Container uses
 * min(--site-container-max, 100%) which clamps to the viewport. This ensures
 * the head is readable at all breakpoints even when the spread grid overflows.
 * The spread-based 2-by-2 page layout and per-page figcaption are preserved.
 */
import { Container, SectionHead } from "../shared/section-primitives";
import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import type { SectionComponentProps } from "../types";
import type { LookbookV1 } from "./schema";

export function LookbookComponent({ props }: SectionComponentProps<LookbookV1>) {
  const { eyebrow, headline, pages, variant, ratio, presentation } = props;
  // Pair pages 2-by-2 for the spread variant; one-up otherwise.
  const pairs: Array<[LookbookV1["pages"][number], LookbookV1["pages"][number] | null]> = [];
  if (variant === "spread") {
    for (let i = 0; i < pages.length; i += 2) {
      pairs.push([pages[i], pages[i + 1] ?? null]);
    }
  } else {
    pages.forEach((p) => pairs.push([p, null]));
  }
  return (
    <section
      className="site-lookbook"
      data-variant={variant}
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
      <div className="site-lookbook__inner">
        <div className="site-lookbook__pages">
          {pairs.map((pair, i) => (
            <div className="site-lookbook__spread" key={`spread-${i}`}>
              {pair.map((p, k) => {
                if (!p) return <div key={k} className="site-lookbook__page site-lookbook__page--blank" aria-hidden />;
                return (
                  <figure key={k} className="site-lookbook__page" style={{ aspectRatio: ratio }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.imageUrl} alt={p.alt ?? ""} aria-hidden={p.alt ? undefined : true} loading="lazy" />
                    {p.caption ? <figcaption className="site-lookbook__caption">{p.caption}</figcaption> : null}
                  </figure>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
