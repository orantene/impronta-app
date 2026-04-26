import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import type { SectionComponentProps } from "../types";
import type { TestimonialsTrioV1, TestimonialsTrioItem } from "./schema";

const AUTO_CYCLE: ReadonlyArray<NonNullable<TestimonialsTrioItem["accent"]>> = [
  "blush",
  "sage",
  "champagne",
  "ivory",
];

export function TestimonialsTrioComponent({
  props,
}: SectionComponentProps<TestimonialsTrioV1>) {
  const { eyebrow, headline, items, variant, defaultAccent, presentation } = props;
  const resolvedAccent = (item: TestimonialsTrioItem, i: number) => {
    const wanted = item.accent ?? defaultAccent ?? "auto";
    if (wanted === "auto") return AUTO_CYCLE[i % AUTO_CYCLE.length];
    return wanted;
  };
  return (
    <section
      className="site-testimonials-trio"
      data-variant={variant}
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      <div className="site-testimonials-trio__inner">
        {(eyebrow || headline) && (
          <header className="site-testimonials-trio__head">
            {eyebrow ? <span className="site-eyebrow">{eyebrow}</span> : null}
            {headline ? (
              <h2 className="site-testimonials-trio__headline">
                {renderInlineRich(headline)}
              </h2>
            ) : null}
          </header>
        )}
        <div className="site-testimonials-trio__grid">
          {items.map((item, i) => (
            <article
              key={`${item.author ?? ""}-${i}`}
              className="site-testimonials-trio__card"
              data-accent={resolvedAccent(item, i)}
            >
              <svg
                aria-hidden
                className="site-testimonials-trio__quote"
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M7 17c-2 0-3-1.2-3-3.2 0-3 2-5.8 5-6.8l.5 1.5c-1.5.5-2.5 2-2.5 3.5H7c1.5 0 2.5 1 2.5 2.5S8.5 17 7 17Z" />
                <path d="M16.5 17c-2 0-3-1.2-3-3.2 0-3 2-5.8 5-6.8l.5 1.5c-1.5.5-2.5 2-2.5 3.5h.5c1.5 0 2.5 1 2.5 2.5s-1 2.5-3 2.5Z" />
              </svg>
              <p className="site-testimonials-trio__text">
                &ldquo;{item.quote}&rdquo;
              </p>
              {(item.author || item.context || item.location) && (
                <footer className="site-testimonials-trio__meta">
                  {item.author ? (
                    <strong className="site-testimonials-trio__author">
                      {item.author}
                    </strong>
                  ) : null}
                  {item.context || item.location ? (
                    <span className="site-testimonials-trio__context">
                      {[item.context, item.location].filter(Boolean).join(" · ")}
                    </span>
                  ) : null}
                </footer>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
